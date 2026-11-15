import type { ApuestaLiquidadaPayload, EstadoApuesta } from '@apuestas/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { aTexto, Decimal, redondear } from '../comun/decimal.js';
import {
  type ApuestaLiquidada,
  AUDITORIA_PORT,
  type AuditoriaPort,
  BILLETERA_PORT,
  type BilleteraPort,
  type ClienteTransaccional,
  EVENTOS,
} from '../contracts/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificadorService } from '../tiempo-real/notificador.service.js';
import { calcularLiquidacion, type Liquidacion } from './estado-apuesta.js';
import { resolverAlFinal, resolverDecidida } from './reglas-mercado.js';

export interface ResumenLiquidacion {
  /** Apuestas que pasaron a GANADA, PERDIDA o ANULADA en este procesamiento. */
  readonly liquidadas: number;
  /** Apuestas afectadas que siguen pendientes (combinadas con partidos por jugar) o que ya estaban liquidadas. */
  readonly pendientes: number;
}

interface ApuestaLiquidadaInterna {
  readonly usuarioId: string;
  readonly apuestaId: string;
  readonly estado: Exclude<EstadoApuesta, 'PENDIENTE'>;
  readonly monto: Decimal;
  readonly premio: Decimal;
  readonly liquidadaEn: Date;
}

const OPCIONES_TRANSACCION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 15_000,
} as const;

/**
 * Liquidación automática e idempotente (research.md §7, FR-025 a FR-030). Primero resuelve las selecciones del
 * partido con su marcador final; luego liquida cada apuesta afectada en SU PROPIA transacción, con su fila
 * bloqueada. Tres defensas contra el doble pago, cualquiera basta: el estado de la apuesta (solo PENDIENTE), la
 * fila única en `liquidacion` y la clave de idempotencia de la billetera.
 */
@Injectable()
export class LiquidacionService {
  private readonly logger = new Logger('Liquidacion');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLETERA_PORT) private readonly billetera: BilleteraPort,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
    private readonly eventos: EventEmitter2,
    private readonly notificador: NotificadorService,
  ) {}

  /**
   * Liquida las apuestas de un partido finalizado con esa versión de resultado. Si el partido no está finalizado
   * o la versión no es la vigente (un trabajo viejo), no hace nada. Ante un error transitorio lo relanza: lo ya
   * liquidado queda confirmado y el reintento continúa con el resto.
   */
  async liquidarPartido(partidoId: string, versionResultado: number): Promise<ResumenLiquidacion> {
    const vigente = await this.resolverSelecciones(partidoId, versionResultado);
    if (!vigente) return { liquidadas: 0, pendientes: 0 };
    return this.liquidarAfectadas(partidoId, versionResultado);
  }

  /**
   * Vence el plazo de un partido suspendido o aplazado (research.md §8, FR-033): si sigue igual que cuando se
   * programó el vencimiento, se cancela y se anulan sus apuestas. Si se reanudó o reprogramó, no hace nada.
   */
  async vencerPlazo(partidoId: string, suspendidoEn: string): Promise<ResumenLiquidacion> {
    const vencido = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM partido WHERE id = ${partidoId}::uuid FOR UPDATE`;
      const partido = await tx.partido.findUnique({ where: { id: partidoId } });
      const sigueIgual =
        (partido?.estado === 'SUSPENDIDO' || partido?.estado === 'APLAZADO') &&
        partido.suspendidoEn?.toISOString() === suspendidoEn;
      if (!partido || !sigueIgual) return false;
      await tx.mercado.updateMany({
        where: { partidoId, estado: { not: 'CERRADO' } },
        data: { estado: 'CERRADO' },
      });
      await tx.partido.update({
        where: { id: partidoId },
        data: { estado: 'CANCELADO', version: { increment: 1 } },
      });
      await this.auditoria.registrar(
        {
          actorId: null,
          accion: 'partido.anulado_por_plazo',
          entidad: 'partido',
          entidadId: partidoId,
          datos: { estadoAnterior: partido.estado, suspendidoEn },
        },
        tx,
      );
      return true;
    }, OPCIONES_TRANSACCION);
    return vencido ? this.anularPartido(partidoId) : { liquidadas: 0, pendientes: 0 };
  }

  /**
   * Anula un partido cancelado (FR-034) por el mismo camino de la liquidación: las selecciones ya decididas con el
   * marcador de la suspensión se liquidan (FR-031) y el resto se anula; simples reembolsadas, combinadas con 1.00.
   * Idempotente: repetirlo no reembolsa dos veces.
   */
  async anularPartido(partidoId: string): Promise<ResumenLiquidacion> {
    const version = await this.prisma.$transaction(async (tx) => {
      const partido = await tx.partido.findUnique({
        where: { id: partidoId },
        include: { mercados: { include: { selecciones: true } } },
      });
      if (partido?.estado !== 'CANCELADO') return null;
      const { golesLocalSuspension: local, golesVisitanteSuspension: visitante } = partido;
      for (const mercado of partido.mercados) {
        for (const seleccion of mercado.selecciones.filter((s) => s.resultado === 'PENDIENTE')) {
          const decidida =
            local !== null && visitante !== null
              ? resolverDecidida(
                  {
                    tipo: mercado.tipo,
                    codigo: seleccion.codigo,
                    linea: mercado.linea?.toFixed(1) ?? null,
                  },
                  local,
                  visitante,
                )
              : null;
          await tx.seleccion.update({
            where: { id: seleccion.id },
            data: { resultado: decidida ?? 'ANULADA' },
          });
        }
      }
      await copiarResultados(tx, partidoId);
      return partido.versionResultado;
    }, OPCIONES_TRANSACCION);
    if (version === null) return { liquidadas: 0, pendientes: 0 };
    return this.liquidarAfectadas(partidoId, version);
  }

  /** Liquida, una por una y cada una en su transacción, las apuestas pendientes con selecciones del partido. */
  private async liquidarAfectadas(
    partidoId: string,
    versionResultado: number,
  ): Promise<ResumenLiquidacion> {
    const afectadas = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT sa.apuesta_id::text AS id
      FROM seleccion_apostada sa JOIN apuesta a ON a.id = sa.apuesta_id
      WHERE sa.partido_id = ${partidoId}::uuid AND a.estado = 'PENDIENTE'
      ORDER BY id`;
    let liquidadas = 0;
    for (const { id } of afectadas) {
      if (await this.liquidarApuesta(id, versionResultado)) liquidadas += 1;
    }
    return { liquidadas, pendientes: afectadas.length - liquidadas };
  }

  /** Resuelve las selecciones pendientes del partido y copia el resultado a las selecciones apostadas. */
  private async resolverSelecciones(partidoId: string, versionResultado: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const partido = await tx.partido.findUnique({
        where: { id: partidoId },
        include: { mercados: { include: { selecciones: true } } },
      });
      if (partido?.estado !== 'FINALIZADO' || partido.versionResultado !== versionResultado) {
        return false;
      }
      if (partido.golesLocal === null || partido.golesVisitante === null) {
        // Un partido finalizado sin marcador no se puede liquidar: se reintenta cuando lo carguen.
        throw new Error(`El partido ${partidoId} está finalizado sin marcador`);
      }
      for (const mercado of partido.mercados) {
        for (const seleccion of mercado.selecciones.filter((s) => s.resultado === 'PENDIENTE')) {
          const resultado = resolverAlFinal(
            {
              tipo: mercado.tipo,
              codigo: seleccion.codigo,
              linea: mercado.linea?.toFixed(1) ?? null,
            },
            partido.golesLocal,
            partido.golesVisitante,
          );
          await tx.seleccion.update({ where: { id: seleccion.id }, data: { resultado } });
        }
      }
      await copiarResultados(tx, partidoId);
      return true;
    }, OPCIONES_TRANSACCION);
  }

  /** Una transacción por apuesta, con su fila bloqueada. Devuelve `true` si la liquidó ahora. */
  async liquidarApuesta(apuestaId: string, versionResultado: number): Promise<boolean> {
    const liquidada = await this.prisma.$transaction(
      (tx) => this.liquidarEnTransaccion(tx, apuestaId, versionResultado),
      OPCIONES_TRANSACCION,
    );
    if (!liquidada) return false;
    // Solo después del commit: nunca se avisa de un pago que se revirtió (FR-029, FR-030).
    this.anunciar(liquidada);
    return true;
  }

  private async liquidarEnTransaccion(
    tx: ClienteTransaccional,
    apuestaId: string,
    versionResultado: number,
  ): Promise<ApuestaLiquidadaInterna | null> {
    await tx.$queryRaw`SELECT id FROM apuesta WHERE id = ${apuestaId}::uuid FOR UPDATE`;
    const apuesta = await tx.apuesta.findUnique({
      where: { id: apuestaId },
      include: { selecciones: true },
    });
    if (apuesta?.estado !== 'PENDIENTE') return null;

    const liquidacion = calcularLiquidacion(apuesta.monto, apuesta.selecciones);
    if (liquidacion.estado === 'PENDIENTE') {
      await this.recalcularSiHayAnuladas(tx, apuesta, liquidacion);
      return null;
    }
    const estado = liquidacion.estado;
    const clave = claveDe(apuestaId, estado);
    if (await tx.liquidacion.findUnique({ where: { claveIdempotencia: clave } })) return null;

    await this.moverDinero(tx, apuesta, liquidacion, clave);
    const ahora = (await tx.$queryRaw<Array<{ ahora: Date }>>`SELECT now() AS ahora`)[0]!.ahora;
    const premio = estado === 'GANADA' ? liquidacion.montoAPagar : new Decimal(0);
    await tx.liquidacion.create({
      data: {
        apuestaId,
        tipo: estado === 'ANULADA' ? 'ANULACION' : 'LIQUIDACION',
        estadoResultante: estado,
        montoMovido: liquidacion.montoAPagar,
        versionResultado,
        claveIdempotencia: clave,
      },
    });
    await tx.apuesta.update({
      where: { id: apuestaId },
      data: {
        estado,
        premioPagado: premio,
        // En combinadas con anuladas la cuota efectiva (1.00 en ellas) reemplaza a la original (FR-035).
        cuotaTotal: Decimal.max(liquidacion.cuotaEfectiva, 1),
        gananciaPotencial: estado === 'GANADA' ? premio : apuesta.gananciaPotencial,
        liquidadaEn: ahora,
      },
    });
    await this.auditoria.registrar(
      {
        actorId: null,
        accion: estado === 'ANULADA' ? 'apuesta.anulada' : 'apuesta.liquidada',
        entidad: 'apuesta',
        entidadId: apuestaId,
        datos: {
          estado,
          montoMovido: aTexto(liquidacion.montoAPagar),
          cuotaEfectiva: aTexto(liquidacion.cuotaEfectiva),
          versionResultado,
        },
      },
      tx,
    );
    return {
      usuarioId: apuesta.usuarioId,
      apuestaId,
      estado,
      monto: apuesta.monto,
      premio,
      liquidadaEn: ahora,
    };
  }

  /**
   * Combinada pendiente con alguna selección anulada: la cuota total pasa a contar 1.00 en ella y el resto sigue
   * vigente (FR-035, HU6 escenario 5). El disparador de inmutabilidad permite cambiar solo esas dos columnas.
   */
  private async recalcularSiHayAnuladas(
    tx: ClienteTransaccional,
    apuesta: {
      id: string;
      monto: Decimal;
      cuotaTotal: Decimal;
      selecciones: Array<{ resultado: string }>;
    },
    liquidacion: Liquidacion,
  ): Promise<void> {
    const hayAnuladas = apuesta.selecciones.some((s) => s.resultado === 'ANULADA');
    if (!hayAnuladas || apuesta.cuotaTotal.equals(liquidacion.cuotaEfectiva)) return;
    await tx.apuesta.update({
      where: { id: apuesta.id },
      data: {
        cuotaTotal: Decimal.max(liquidacion.cuotaEfectiva, 1),
        gananciaPotencial: redondear(apuesta.monto.times(liquidacion.cuotaEfectiva)),
      },
    });
  }

  private async moverDinero(
    tx: ClienteTransaccional,
    apuesta: { id: string; usuarioId: string; tipoSaldo: 'REAL' | 'BONO' },
    liquidacion: Liquidacion,
    claveIdempotencia: string,
  ): Promise<void> {
    const operacion = {
      usuarioId: apuesta.usuarioId,
      apuestaId: apuesta.id,
      // El premio y el reembolso vuelven al mismo tipo de saldo con que se apostó (FR-026).
      tipoSaldo: apuesta.tipoSaldo,
      monto: liquidacion.montoAPagar,
      claveIdempotencia,
    };
    if (liquidacion.estado === 'GANADA') await this.billetera.acreditarPremio(tx, operacion);
    if (liquidacion.estado === 'ANULADA') await this.billetera.reembolsarApuesta(tx, operacion);
  }

  private anunciar(liquidada: ApuestaLiquidadaInterna): void {
    const evento: ApuestaLiquidada = {
      usuarioId: liquidada.usuarioId,
      apuestaId: liquidada.apuestaId,
      resultado: liquidada.estado,
      monto: aTexto(liquidada.monto),
      premio: aTexto(liquidada.premio),
    };
    this.eventos.emit(EVENTOS.apuestaLiquidada, evento);
    const aviso: Omit<ApuestaLiquidadaPayload, 'emitidoEn'> = {
      apuestaId: liquidada.apuestaId,
      estado: liquidada.estado,
      premio: aTexto(liquidada.premio),
      liquidadaEn: liquidada.liquidadaEn.toISOString(),
    };
    this.notificador.apuestaLiquidada(liquidada.usuarioId, aviso);
    this.logger.log(`Apuesta ${liquidada.apuestaId} liquidada: ${liquidada.estado}`);
  }
}

/** Claves de contratos.md §2: la misma va a la billetera y a la fila única de `liquidacion`. */
function claveDe(apuestaId: string, estado: Exclude<EstadoApuesta, 'PENDIENTE'>): string {
  const operacion = { GANADA: 'premio', ANULADA: 'reembolso', PERDIDA: 'perdida' } as const;
  return `apuesta:${apuestaId}:${operacion[estado]}`;
}

/** Copia a las selecciones apostadas el resultado ya resuelto de las selecciones del partido. */
async function copiarResultados(tx: ClienteTransaccional, partidoId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE seleccion_apostada sa SET resultado = s.resultado
    FROM seleccion s
    WHERE sa.seleccion_id = s.id AND sa.partido_id = ${partidoId}::uuid
      AND sa.resultado = 'PENDIENTE' AND s.resultado <> 'PENDIENTE'`;
}
