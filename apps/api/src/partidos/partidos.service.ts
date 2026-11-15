import type {
  CompeticionDto,
  EstadoPartido,
  Pagina,
  PartidoDetalleDto,
  PartidoResumenDto,
} from '@apuestas/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ContextoOperacion } from '../comun/contexto-operacion.js';
import {
  AUDITORIA_PORT,
  type AuditoriaPort,
  type ClienteTransaccional,
} from '../contracts/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificadorService } from '../tiempo-real/notificador.service.js';
import { encolarLiquidacion } from '../liquidacion/liquidacion.processor.js';
import { COLAS } from '../colas/nombres.js';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { rutaDeEstados, validarTransicion } from './maquina-estados.js';
import {
  aCompeticionDto,
  aPartidoDetalleDto,
  aPartidoResumenDto,
  INCLUIR_DETALLE,
} from './partidos.mapeo.js';
import type {
  ConsultaCartelera,
  CrearCompeticion,
  CrearPartido,
  EditarPartido,
} from './partidos.esquemas.js';

/** Cambio de un partido, venga del operador, del proveedor o de la simulación (research.md §10). */
export interface ActualizacionPartido {
  readonly estado?: EstadoPartido;
  readonly golesLocal?: number;
  readonly golesVisitante?: number;
  readonly minuto?: number | null;
  /** Nueva hora de inicio al reprogramar un partido aplazado. */
  readonly inicioEn?: Date;
  readonly motivo?: string;
}

/** La cartelera muestra por defecto lo que todavía se puede jugar. */
const ESTADOS_CARTELERA: readonly EstadoPartido[] = [
  'PROGRAMADO',
  'EN_VIVO',
  'SUSPENDIDO',
  'APLAZADO',
];

type Partido = Prisma.PartidoGetPayload<object>;

/** Bloquea la fila del partido hasta el final de la transacción y la devuelve (404 si no existe). */
export async function bloquearPartido(tx: ClienteTransaccional, id: string): Promise<Partido> {
  await tx.$queryRaw`SELECT id FROM partido WHERE id = ${id}::uuid FOR UPDATE`;
  const partido = await tx.partido.findUnique({ where: { id } });
  if (!partido) throw new NotFoundException('El partido no existe');
  return partido;
}

/** Hora del servidor de base de datos: la única que cuenta para cerrar mercados (FR-017). */
export async function ahoraServidor(tx: ClienteTransaccional): Promise<Date> {
  const filas = await tx.$queryRaw<Array<{ ahora: Date }>>`SELECT now() AS ahora`;
  return filas[0]?.ahora ?? new Date();
}

@Injectable()
export class PartidosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
    private readonly notificador: NotificadorService,
    @InjectQueue(COLAS.liquidacion) private readonly colaLiquidacion: Queue,
  ) {}

  private readonly logger = new Logger('Partidos');

  // --- Consultas (cartelera y detalle) ---

  async listar(consulta: ConsultaCartelera): Promise<Pagina<PartidoResumenDto>> {
    const where: Prisma.PartidoWhereInput = {
      estado: consulta.estado ?? { in: [...ESTADOS_CARTELERA] },
      ...(consulta.competicionId ? { competicionId: consulta.competicionId } : {}),
      ...(consulta.desde || consulta.hasta
        ? { inicioEn: { gte: consulta.desde, lte: consulta.hasta } }
        : {}),
    };
    const [total, partidos] = await this.prisma.$transaction([
      this.prisma.partido.count({ where }),
      this.prisma.partido.findMany({
        where,
        include: { competicion: true },
        orderBy: [{ inicioEn: 'asc' }, { id: 'asc' }],
        skip: (consulta.pagina - 1) * consulta.porPagina,
        take: consulta.porPagina,
      }),
    ]);
    return {
      elementos: partidos.map(aPartidoResumenDto),
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
      total,
    };
  }

  async obtener(id: string, tx: ClienteTransaccional = this.prisma): Promise<PartidoDetalleDto> {
    const partido = await tx.partido.findUnique({ where: { id }, include: INCLUIR_DETALLE });
    if (!partido) throw new NotFoundException('El partido no existe');
    return aPartidoDetalleDto(partido);
  }

  async listarCompeticiones(): Promise<CompeticionDto[]> {
    const competiciones = await this.prisma.competicion.findMany({ orderBy: { nombre: 'asc' } });
    return competiciones.map(aCompeticionDto);
  }

  // --- Gestión del operador ---

  async crearCompeticion(
    datos: CrearCompeticion,
    contexto: ContextoOperacion,
  ): Promise<CompeticionDto> {
    return this.prisma.$transaction(async (tx) => {
      const competicion = await tx.competicion.create({
        data: { nombre: datos.nombre, pais: datos.pais ?? null },
      });
      await this.auditar(tx, contexto, 'competicion.creada', 'competicion', competicion.id, {
        nombre: competicion.nombre,
      });
      return aCompeticionDto(competicion);
    });
  }

  async crearPartido(datos: CrearPartido, contexto: ContextoOperacion): Promise<PartidoDetalleDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.exigirFutura(tx, datos.inicioEn);
      const competicion = await tx.competicion.findUnique({ where: { id: datos.competicionId } });
      if (!competicion) throw new BadRequestException('La competición no existe');

      const partido = await tx.partido.create({
        data: {
          competicionId: datos.competicionId,
          nombreLocal: datos.nombreLocal,
          nombreVisitante: datos.nombreVisitante,
          inicioEn: datos.inicioEn,
          inicioOriginalEn: datos.inicioEn,
          origen: contexto.origen,
        },
      });
      await this.auditar(tx, contexto, 'partido.creado', 'partido', partido.id, {
        nombreLocal: partido.nombreLocal,
        nombreVisitante: partido.nombreVisitante,
        inicioEn: partido.inicioEn.toISOString(),
      });
      return this.obtener(partido.id, tx);
    });
  }

  /** Corrige nombres u hora de un partido que aún no empezó. */
  async editarPartido(
    id: string,
    datos: EditarPartido,
    contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.prisma.$transaction(async (tx) => {
      const partido = await bloquearPartido(tx, id);
      if (partido.estado !== 'PROGRAMADO') {
        throw new ConflictException('Solo se puede editar un partido programado');
      }
      if (datos.inicioEn) await this.exigirFutura(tx, datos.inicioEn);
      const local = datos.nombreLocal ?? partido.nombreLocal;
      const visitante = datos.nombreVisitante ?? partido.nombreVisitante;
      if (local.toLowerCase() === visitante.toLowerCase()) {
        throw new BadRequestException('El equipo local y el visitante deben ser distintos');
      }

      await tx.partido.update({
        where: { id },
        data: {
          nombreLocal: local,
          nombreVisitante: visitante,
          // Antes de empezar, la hora corregida es también la original (base del plazo de aplazamiento).
          ...(datos.inicioEn ? { inicioEn: datos.inicioEn, inicioOriginalEn: datos.inicioEn } : {}),
          version: { increment: 1 },
        },
      });
      await this.auditar(tx, contexto, 'partido.editado', 'partido', id, {
        anterior: {
          nombreLocal: partido.nombreLocal,
          nombreVisitante: partido.nombreVisitante,
          inicioEn: partido.inicioEn.toISOString(),
        },
        cambios: { ...datos, inicioEn: datos.inicioEn?.toISOString() },
      });
      return this.obtener(id, tx);
    });
  }

  /**
   * Único punto de entrada de los cambios de estado y marcador de un partido, venga del operador, del
   * proveedor o de la simulación: así hay un solo camino hacia la liquidación (plan.md).
   * Aplica la máquina de estados y sus efectos sobre los mercados en una sola transacción.
   */
  async aplicarActualizacion(
    id: string,
    cambio: ActualizacionPartido,
    contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const partido = await bloquearPartido(tx, id);
      const cambiaEstado = cambio.estado !== undefined && cambio.estado !== partido.estado;
      const cambiaMarcador = this.cambiaMarcador(partido, cambio);
      if (!cambiaEstado && !cambiaMarcador)
        return { detalle: await this.obtener(id, tx), cambio: false, liquidar: undefined };

      let datos: Prisma.PartidoUpdateInput = { version: { increment: 1 } };
      if (cambiaEstado && cambio.estado) {
        validarTransicion(partido.estado, cambio.estado);
        datos = { ...datos, ...(await this.efectosDeEstado(tx, partido, cambio.estado, cambio)) };
        await this.auditar(tx, contexto, 'partido.estado_cambiado', 'partido', id, {
          anterior: partido.estado,
          nuevo: cambio.estado,
          motivo: cambio.motivo,
        });
      }
      if (cambiaMarcador) {
        datos = { ...datos, ...this.datosDeMarcador(partido, cambio) };
        await this.auditar(tx, contexto, 'partido.marcador_actualizado', 'partido', id, {
          anterior: [partido.golesLocal, partido.golesVisitante],
          nuevo: [cambio.golesLocal, cambio.golesVisitante],
          minuto: cambio.minuto,
        });
      }
      const actualizado = await tx.partido.update({ where: { id }, data: datos });
      const finalizo = cambiaEstado && cambio.estado === 'FINALIZADO';
      return {
        detalle: await this.obtener(id, tx),
        cambio: true,
        liquidar: finalizo ? actualizado.versionResultado : undefined,
      };
    });
    const { detalle, cambio: huboCambio, liquidar } = resultado;
    // Solo después del commit: nunca se avisa ni se liquida un cambio que se revirtió.
    if (huboCambio) this.notificador.partidoActualizado(detalle);
    if (liquidar !== undefined) await this.encolarLiquidacion(id, liquidar);
    return detalle;
  }

  /**
   * Finaliza un partido con su marcador del tiempo reglamentario (POST /operador/partidos/:id/resultado). Si el
   * partido no pasó por "en vivo", recorre la máquina de estados paso a paso. Corregir un resultado ya finalizado
   * es la HU8.
   */
  async registrarResultado(
    id: string,
    datos: { golesLocal: number; golesVisitante: number; motivo: string },
    contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    const partido = await this.obtener(id);
    if (partido.estado === 'FINALIZADO') {
      throw new ConflictException(
        'El partido ya está finalizado: la corrección de resultados es la HU8',
      );
    }
    const ruta = rutaDeEstados(partido.estado, 'FINALIZADO');
    if (!ruta?.length) validarTransicion(partido.estado, 'FINALIZADO');
    let detalle = partido;
    for (const estado of ruta ?? []) {
      const marcador =
        estado === 'FINALIZADO'
          ? { golesLocal: datos.golesLocal, golesVisitante: datos.golesVisitante }
          : {};
      detalle = await this.aplicarActualizacion(
        id,
        { estado, motivo: datos.motivo, ...marcador },
        contexto,
      );
    }
    return detalle;
  }

  /** La cola persiste el trabajo; si Redis falla, el arranque del procesador lo vuelve a encolar (FR-028). */
  private async encolarLiquidacion(partidoId: string, versionResultado: number): Promise<void> {
    try {
      await encolarLiquidacion(this.colaLiquidacion, { partidoId, versionResultado });
    } catch (error) {
      this.logger.error(`No se pudo encolar la liquidación de ${partidoId}: ${String(error)}`);
    }
  }

  private cambiaMarcador(partido: Partido, cambio: ActualizacionPartido): boolean {
    return (
      (cambio.golesLocal !== undefined && cambio.golesLocal !== partido.golesLocal) ||
      (cambio.golesVisitante !== undefined && cambio.golesVisitante !== partido.golesVisitante) ||
      (cambio.minuto !== undefined && cambio.minuto !== partido.minuto)
    );
  }

  private datosDeMarcador(
    partido: Partido,
    cambio: ActualizacionPartido,
  ): Prisma.PartidoUpdateInput {
    const estadoFinal = cambio.estado ?? partido.estado;
    if (estadoFinal !== 'EN_VIVO' && estadoFinal !== 'FINALIZADO') {
      throw new ConflictException('El marcador solo se actualiza con el partido en vivo');
    }
    return {
      golesLocal: cambio.golesLocal ?? partido.golesLocal,
      golesVisitante: cambio.golesVisitante ?? partido.golesVisitante,
      ...(cambio.minuto !== undefined ? { minuto: cambio.minuto } : {}),
    };
  }

  /** Efectos de cada transición sobre el partido y sus mercados (data-model.md, "Efectos"). */
  private async efectosDeEstado(
    tx: ClienteTransaccional,
    partido: Partido,
    hacia: EstadoPartido,
    cambio: ActualizacionPartido,
  ): Promise<Prisma.PartidoUpdateInput> {
    const mercados = (
      where: Prisma.MercadoWhereInput,
      estado: 'ABIERTO' | 'SUSPENDIDO' | 'CERRADO',
    ) => tx.mercado.updateMany({ where: { partidoId: partido.id, ...where }, data: { estado } });

    switch (hacia) {
      case 'EN_VIVO':
        if (partido.estado === 'SUSPENDIDO') {
          // Reanudación dentro del plazo: vuelven a abrir los mercados de vivo.
          await mercados({ admiteVivo: true, estado: 'SUSPENDIDO' }, 'ABIERTO');
          return { estado: hacia, suspendidoEn: null };
        }
        // Inicio: los mercados pre-partido se cierran (FR-017, HU7 escenario 3).
        await mercados({ admiteVivo: false, estado: { not: 'CERRADO' } }, 'CERRADO');
        return {
          estado: hacia,
          golesLocal: partido.golesLocal ?? 0,
          golesVisitante: partido.golesVisitante ?? 0,
        };
      case 'SUSPENDIDO':
      case 'APLAZADO':
        // Las apuestas existentes siguen pendientes; T067 (HU6) programa el vencimiento del plazo.
        await mercados({ estado: 'ABIERTO' }, 'SUSPENDIDO');
        return {
          estado: hacia,
          suspendidoEn: await ahoraServidor(tx),
          golesLocalSuspension: partido.golesLocal,
          golesVisitanteSuspension: partido.golesVisitante,
        };
      case 'PROGRAMADO': {
        // Solo desde APLAZADO (máquina de estados): exige nueva hora y conserva la original.
        if (!cambio.inicioEn) {
          throw new BadRequestException(
            'Indica la nueva hora de inicio para reprogramar el partido',
          );
        }
        await this.exigirFutura(tx, cambio.inicioEn);
        await mercados({ estado: 'SUSPENDIDO' }, 'ABIERTO');
        return { estado: hacia, inicioEn: cambio.inicioEn, suspendidoEn: null };
      }
      case 'FINALIZADO':
        await mercados({ estado: { not: 'CERRADO' } }, 'CERRADO');
        return { estado: hacia, minuto: null, versionResultado: { increment: 1 } };
      case 'CANCELADO':
        // T067 (HU6): anular y reembolsar sus apuestas por el camino de la liquidación.
        await mercados({ estado: { not: 'CERRADO' } }, 'CERRADO');
        return { estado: hacia };
    }
  }

  private async exigirFutura(tx: ClienteTransaccional, inicioEn: Date): Promise<void> {
    if (inicioEn.getTime() <= (await ahoraServidor(tx)).getTime()) {
      throw new BadRequestException('La hora de inicio debe ser futura');
    }
  }

  private auditar(
    tx: ClienteTransaccional,
    contexto: ContextoOperacion,
    accion: string,
    entidad: string,
    entidadId: string,
    datos: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.registrar(
      {
        actorId: contexto.actorId,
        accion,
        entidad,
        entidadId,
        datos: { ...datos, origen: contexto.origen },
        ...(contexto.ip ? { ip: contexto.ip } : {}),
        ...(contexto.dispositivo ? { dispositivo: contexto.dispositivo } : {}),
      },
      tx,
    );
  }
}
