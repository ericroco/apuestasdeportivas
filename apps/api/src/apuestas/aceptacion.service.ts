import { randomUUID } from 'node:crypto';
import type { ApuestaDto, SolicitudVivoAceptadaDto } from '@apuestas/shared';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { COLAS } from '../colas/nombres.js';
import type { DatosCliente } from '../comun/contexto-operacion.js';
import { aTexto, Decimal } from '../comun/decimal.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import { errorApuestas } from '../comun/errores-apuestas.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import {
  type ApuestaAceptada,
  AUDITORIA_PORT,
  type AuditoriaPort,
  BILLETERA_PORT,
  type BilleteraPort,
  type ClienteTransaccional,
  CuponInvalidoError,
  EVENTOS,
  PROMOCIONES_APUESTA_PORT,
  type PromocionesApuestaPort,
  SaldoInsuficienteError,
  type SaldosUsuario,
  type TipoSaldo,
  type UsuarioAutenticado,
} from '../contracts/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificadorService } from '../tiempo-real/notificador.service.js';
import { aApuestaDto, INCLUIR_SELECCIONES } from './apuestas.mapeo.js';
import type { SolicitudApuesta } from './apuestas.esquemas.js';
import {
  calcularCuotaTotal,
  calcularGanancia,
  inicioDelDiaLocal,
  type Limites,
  validarCombinada,
  validarLimites,
} from './calculo.js';

interface SeleccionVigente {
  seleccion_id: string;
  cuota: string;
  estado_mercado: string;
  partido_id: string;
  estado_partido: string;
  inicio_en: Date;
  version: number;
  ahora: Date;
}

interface Validacion {
  readonly vigentes: SeleccionVigente[];
  readonly cuotaBase: Decimal;
  readonly saldos: SaldosUsuario;
  readonly apostadoHoy: Decimal;
}

interface Efecto {
  readonly tipoSaldo: TipoSaldo;
  readonly cuotaTotal: Decimal;
  readonly cuponId: string | null;
}

export type ResultadoAceptacion =
  | { readonly tipo: 'apuesta'; readonly apuesta: ApuestaDto; readonly nueva: boolean }
  | {
      readonly tipo: 'vivo';
      readonly solicitud: SolicitudVivoAceptadaDto;
      readonly nueva: boolean;
    };

/** Lo que se guarda de una apuesta en vivo para revalidarla al terminar el retardo (research.md §6). */
const datosSolicitudVivo = z.object({
  monto: z.string(),
  selecciones: z.array(z.object({ seleccionId: z.string(), cuotaVista: z.string() })),
  codigoCupon: z.string().optional(),
  /** Versión de cada partido en vivo al pedir: cualquier gol, cambio de estado o de cuota la sube. */
  versiones: z.record(z.string(), z.number()),
  cliente: z.object({ ip: z.string().optional(), dispositivo: z.string().optional() }),
});
type DatosSolicitudVivo = z.infer<typeof datosSolicitudVivo>;

/** Varias solicitudes del mismo usuario esperan su turno en el bloqueo: hace falta margen. */
const OPCIONES_TRANSACCION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 15_000,
} as const;

const ROLES_SIN_APUESTAS = ['OPERADOR', 'ADMINISTRADOR'] as const;
const INTENTOS_TRABAJO_VIVO = 5;

/**
 * Aceptación atómica de apuestas (research.md §4 y §6, FR-015 a FR-022): validar, descontar y registrar en UNA
 * transacción. Si cualquier paso falla, no queda apuesta ni movimiento de dinero. Los valores del cliente (cuota
 * vista) solo se comparan; los que cuentan se leen del servidor.
 *
 * Si alguna selección es de un partido en vivo, la apuesta queda "en espera" sin descontar nada y se revalida al
 * terminar el retardo (FR-018): si el partido cambió (gol, estado, cuota o mercado), no se acepta.
 */
@Injectable()
export class AceptacionService {
  private readonly logger = new Logger('AceptacionApuestas');
  private readonly limites: Limites;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLETERA_PORT) private readonly billetera: BilleteraPort,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly eventos: EventEmitter2,
    private readonly notificador: NotificadorService,
    @InjectQueue(COLAS.apuestasVivo) private readonly colaVivo: Queue,
    @Optional()
    @Inject(PROMOCIONES_APUESTA_PORT)
    private readonly promociones?: PromocionesApuestaPort,
  ) {
    this.limites = {
      montoMin: new Decimal(entorno.APUESTA_MONTO_MIN),
      montoMax: new Decimal(entorno.APUESTA_MONTO_MAX),
      diario: new Decimal(entorno.APUESTA_LIMITE_DIARIO_USUARIO),
      gananciaMax: new Decimal(entorno.APUESTA_GANANCIA_MAX),
    };
  }

  async aceptar(
    usuario: UsuarioAutenticado,
    solicitud: SolicitudApuesta,
    cliente: DatosCliente,
  ): Promise<ResultadoAceptacion> {
    // Quien fija cuotas y resultados no apuesta sobre ellos (FR-039).
    if (usuario.roles.some((rol) => (ROLES_SIN_APUESTAS as readonly string[]).includes(rol))) {
      throw errorApuestas(
        'ROL_NO_PUEDE_APOSTAR',
        'Los operadores y administradores no pueden apostar.',
      );
    }
    const resultado = await this.prisma.$transaction(
      (tx) => this.aceptarEnTransaccion(tx, usuario.id, solicitud, cliente),
      OPCIONES_TRANSACCION,
    );
    // Solo después del commit: nunca se anuncia ni se encola algo que se revirtió (FR-024).
    if (resultado.nueva && resultado.tipo === 'apuesta')
      this.anunciar(usuario.id, resultado.apuesta);
    if (resultado.nueva && resultado.tipo === 'vivo') await this.encolar(resultado.solicitud);
    return resultado;
  }

  /**
   * Termina una apuesta en vivo cuando vence su retardo (lo llama VivoProcessor). Idempotente: si la solicitud ya
   * se resolvió, no hace nada. Un error de negocio la rechaza; uno transitorio se relanza para que BullMQ reintente.
   */
  async resolverSolicitudVivo(solicitudId: string): Promise<void> {
    const solicitud = await this.prisma.solicitudApuestaVivo.findUnique({
      where: { id: solicitudId },
    });
    if (solicitud?.estado !== 'EN_ESPERA') return;
    const { usuarioId } = solicitud;
    try {
      const apuesta = await this.prisma.$transaction(
        (tx) => this.resolverEnTransaccion(tx, solicitudId, usuarioId),
        OPCIONES_TRANSACCION,
      );
      if (!apuesta) return;
      this.anunciar(usuarioId, apuesta);
      this.notificador.apuestaVivoResuelta(usuarioId, {
        solicitudId,
        estado: 'ACEPTADA',
        apuestaId: apuesta.id,
      });
    } catch (error) {
      if (!(error instanceof ErrorNegocio) && !(error instanceof NotFoundException)) throw error;
      await this.rechazarSolicitud(solicitudId, usuarioId, motivoDe(error));
    }
  }

  private async aceptarEnTransaccion(
    tx: ClienteTransaccional,
    usuarioId: string,
    solicitud: SolicitudApuesta,
    cliente: DatosCliente,
  ): Promise<ResultadoAceptacion> {
    // 1. Serializa las apuestas del mismo usuario: límite diario, saldo negativo y reenvíos sin carreras.
    await bloquearUsuario(tx, usuarioId);

    // 2. Idempotencia de la solicitud (doble clic, reintento de red), tanto pre-partido como en vivo.
    const clave = {
      usuarioId_claveSolicitud: { usuarioId, claveSolicitud: solicitud.claveSolicitud },
    };
    const repetida = await tx.apuesta.findUnique({ where: clave, include: INCLUIR_SELECCIONES });
    if (repetida) return { tipo: 'apuesta', apuesta: aApuestaDto(repetida), nueva: false };
    const enEspera = await tx.solicitudApuestaVivo.findUnique({ where: clave });
    if (enEspera) {
      const solicitudVivo = {
        solicitudId: enEspera.id,
        ejecutarEn: enEspera.ejecutarEn.toISOString(),
      };
      return { tipo: 'vivo', solicitud: solicitudVivo, nueva: false };
    }

    // 3 y 4. Selecciones con FOR SHARE (la cuota comparada es la que se congela) y validaciones.
    const validacion = await this.validar(tx, usuarioId, solicitud);
    if (validacion.vigentes.some((v) => v.estado_partido === 'EN_VIVO')) {
      return this.ponerEnEspera(tx, usuarioId, solicitud, validacion, cliente);
    }
    const apuesta = await this.registrar(tx, usuarioId, solicitud, validacion, cliente, false);
    return { tipo: 'apuesta', apuesta, nueva: true };
  }

  private async resolverEnTransaccion(
    tx: ClienteTransaccional,
    solicitudId: string,
    usuarioId: string,
  ): Promise<ApuestaDto | null> {
    await bloquearUsuario(tx, usuarioId);
    const solicitud = await tx.solicitudApuestaVivo.findUniqueOrThrow({
      where: { id: solicitudId },
    });
    if (solicitud.estado !== 'EN_ESPERA') return null;

    const datos = datosSolicitudVivo.parse(solicitud.datos);
    const pedida: SolicitudApuesta = {
      claveSolicitud: solicitud.claveSolicitud,
      monto: new Decimal(datos.monto),
      selecciones: datos.selecciones.map((s) => ({
        seleccionId: s.seleccionId,
        cuotaVista: new Decimal(s.cuotaVista),
      })),
      ...(datos.codigoCupon ? { codigoCupon: datos.codigoCupon } : {}),
    };
    const validacion = await this.validar(tx, usuarioId, pedida, datos.versiones);
    const apuesta = await this.registrar(tx, usuarioId, pedida, validacion, datos.cliente, true);
    await tx.solicitudApuestaVivo.update({
      where: { id: solicitudId },
      data: { estado: 'ACEPTADA', apuestaId: apuesta.id },
    });
    return apuesta;
  }

  /** Validaciones comunes a la petición y a la ejecución en vivo; no escriben nada. */
  private async validar(
    tx: ClienteTransaccional,
    usuarioId: string,
    solicitud: SolicitudApuesta,
    versiones?: Readonly<Record<string, number>>,
  ): Promise<Validacion> {
    const vigentes = await this.leerSelecciones(tx, solicitud, versiones);
    const cuotaBase = calcularCuotaTotal(vigentes.map((v) => new Decimal(v.cuota)));
    const saldos = await this.billetera.obtenerSaldos(usuarioId, tx);
    if (saldos.real.isNegative() || saldos.bono.isNegative()) {
      throw errorApuestas(
        'SALDO_NEGATIVO',
        'Tu saldo es negativo por una corrección de resultado: no puedes apostar hasta regularizarlo.',
      );
    }
    const apostadoHoy = await this.apostadoHoy(tx, usuarioId, vigentes[0]!.ahora);
    validarLimites({
      monto: solicitud.monto,
      cuota: cuotaBase,
      apostadoHoy,
      limites: this.limites,
    });
    return { vigentes, cuotaBase, saldos, apostadoHoy };
  }

  /** Apuesta en vivo: se guarda en espera, sin descontar, con la versión de cada partido en vivo. */
  private async ponerEnEspera(
    tx: ClienteTransaccional,
    usuarioId: string,
    solicitud: SolicitudApuesta,
    { vigentes, saldos }: Validacion,
    cliente: DatosCliente,
  ): Promise<ResultadoAceptacion> {
    // Sin saldo no tiene sentido esperar: se rechaza ya (con cupón decide el Spec 4 al ejecutar).
    if (!solicitud.codigoCupon && saldos.real.lessThan(solicitud.monto)) {
      throw errorApuestas(
        'SALDO_INSUFICIENTE',
        `Saldo insuficiente: tienes ${aTexto(saldos.real)} disponibles.`,
        {
          saldoDisponible: aTexto(saldos.real),
        },
      );
    }
    const versiones = Object.fromEntries(
      vigentes.filter((v) => v.estado_partido === 'EN_VIVO').map((v) => [v.partido_id, v.version]),
    );
    const datos: DatosSolicitudVivo = {
      monto: aTexto(solicitud.monto),
      selecciones: solicitud.selecciones.map((s) => ({
        seleccionId: s.seleccionId,
        cuotaVista: aTexto(s.cuotaVista),
      })),
      ...(solicitud.codigoCupon ? { codigoCupon: solicitud.codigoCupon } : {}),
      versiones,
      cliente,
    };
    const ahora = vigentes[0]!.ahora;
    const creada = await tx.solicitudApuestaVivo.create({
      data: {
        usuarioId,
        claveSolicitud: solicitud.claveSolicitud,
        datos,
        versionPartido: Object.values(versiones)[0] ?? 0,
        ejecutarEn: new Date(ahora.getTime() + this.entorno.APUESTA_RETARDO_VIVO_MS),
        creadaEn: ahora,
      },
    });
    const solicitudVivo = { solicitudId: creada.id, ejecutarEn: creada.ejecutarEn.toISOString() };
    return { tipo: 'vivo', solicitud: solicitudVivo, nueva: true };
  }

  /** Pasos 5 a 8 de research.md §4: cupón, registro con cuotas congeladas, débito y auditoría. */
  private async registrar(
    tx: ClienteTransaccional,
    usuarioId: string,
    solicitud: SolicitudApuesta,
    { vigentes, cuotaBase, saldos, apostadoHoy }: Validacion,
    cliente: DatosCliente,
    enVivo: boolean,
  ): Promise<ApuestaDto> {
    const apuestaId = randomUUID();
    const efecto = await this.aplicarCupon(tx, usuarioId, solicitud, cuotaBase);
    if (!efecto.cuotaTotal.equals(cuotaBase)) {
      validarLimites({
        monto: solicitud.monto,
        cuota: efecto.cuotaTotal,
        apostadoHoy,
        limites: this.limites,
      });
    }
    await tx.apuesta.create({
      data: {
        id: apuestaId,
        usuarioId,
        claveSolicitud: solicitud.claveSolicitud,
        tipo: vigentes.length === 1 ? 'SIMPLE' : 'COMBINADA',
        monto: solicitud.monto,
        tipoSaldo: efecto.tipoSaldo,
        cuotaTotal: efecto.cuotaTotal,
        gananciaPotencial: calcularGanancia(solicitud.monto, efecto.cuotaTotal),
        cuponId: efecto.cuponId,
        enVivo,
        aceptadaEn: vigentes[0]!.ahora,
        selecciones: {
          create: vigentes.map((v) => ({
            seleccionId: v.seleccion_id,
            partidoId: v.partido_id,
            cuotaCongelada: v.cuota,
          })),
        },
      },
    });
    await this.debitar(tx, usuarioId, apuestaId, solicitud.monto, efecto.tipoSaldo, saldos);

    const apuesta = await tx.apuesta.findUniqueOrThrow({
      where: { id: apuestaId },
      include: INCLUIR_SELECCIONES,
    });
    await this.auditoria.registrar(
      {
        actorId: usuarioId,
        accion: 'apuesta.aceptada',
        entidad: 'apuesta',
        entidadId: apuestaId,
        datos: {
          tipo: apuesta.tipo,
          monto: aTexto(apuesta.monto),
          tipoSaldo: apuesta.tipoSaldo,
          cuotaTotal: aTexto(apuesta.cuotaTotal),
          enVivo,
          selecciones: vigentes.map((v) => ({ seleccionId: v.seleccion_id, cuota: v.cuota })),
          cuponId: efecto.cuponId,
        },
        ...cliente,
      },
      tx,
    );
    return aApuestaDto(apuesta);
  }

  private async leerSelecciones(
    tx: ClienteTransaccional,
    solicitud: SolicitudApuesta,
    versiones?: Readonly<Record<string, number>>,
  ): Promise<SeleccionVigente[]> {
    const ids = solicitud.selecciones.map((s) => s.seleccionId);
    const filas = await tx.$queryRaw<SeleccionVigente[]>`
      SELECT s.id::text AS seleccion_id, s.cuota::text AS cuota, m.estado::text AS estado_mercado,
             p.id::text AS partido_id, p.estado::text AS estado_partido, p.inicio_en, p.version,
             now() AS ahora
      FROM seleccion s
      JOIN mercado m ON m.id = s.mercado_id
      JOIN partido p ON p.id = m.partido_id
      WHERE s.id = ANY(${ids}::uuid[])
      FOR SHARE OF s, m, p`;
    const porId = new Map(filas.map((fila) => [fila.seleccion_id, fila]));
    // En el orden en que las pidió el cliente; una selección inexistente es un 404.
    const vigentes = ids.map((id) => {
      const fila = porId.get(id);
      if (!fila) throw new NotFoundException('Una de las selecciones no existe');
      return fila;
    });

    validarCombinada(
      vigentes.map((v) => v.partido_id),
      this.entorno.APUESTA_MAX_SELECCIONES,
    );
    for (const vigente of vigentes) exigirAbierto(vigente);
    exigirCuotasVistas(solicitud, vigentes);
    if (versiones) exigirMismaVersion(vigentes, versiones);
    return vigentes;
  }

  private async apostadoHoy(
    tx: ClienteTransaccional,
    usuarioId: string,
    ahora: Date,
  ): Promise<Decimal> {
    const filas = await tx.$queryRaw<Array<{ total: string }>>`
      SELECT COALESCE(SUM(monto), 0)::text AS total FROM apuesta
      WHERE usuario_id = ${usuarioId} AND aceptada_en >= ${inicioDelDiaLocal(ahora)}`;
    return new Decimal(filas[0]?.total ?? 0);
  }

  private async aplicarCupon(
    tx: ClienteTransaccional,
    usuarioId: string,
    solicitud: SolicitudApuesta,
    cuotaTotal: Decimal,
  ): Promise<Efecto> {
    if (!solicitud.codigoCupon) return { tipoSaldo: 'REAL', cuotaTotal, cuponId: null };
    if (!this.promociones) {
      throw errorApuestas(
        'CUPON_INVALIDO',
        'Los cupones no están disponibles en este momento. Apuesta sin cupón o inténtalo más tarde.',
      );
    }
    try {
      const efecto = await this.promociones.aplicarAApuesta(tx, {
        usuarioId,
        codigoCupon: solicitud.codigoCupon,
        monto: solicitud.monto,
        cuotaTotal,
      });
      return {
        tipoSaldo: efecto.tipoSaldo,
        cuotaTotal: efecto.cuotaFinal,
        cuponId: efecto.cuponId,
      };
    } catch (error) {
      if (error instanceof CuponInvalidoError) throw errorApuestas('CUPON_INVALIDO', error.message);
      throw error;
    }
  }

  private async debitar(
    tx: ClienteTransaccional,
    usuarioId: string,
    apuestaId: string,
    monto: Decimal,
    tipoSaldo: TipoSaldo,
    saldos: SaldosUsuario,
  ): Promise<void> {
    try {
      await this.billetera.debitarApuesta(tx, {
        usuarioId,
        apuestaId,
        tipoSaldo,
        monto,
        claveIdempotencia: `apuesta:${apuestaId}:debito`,
      });
    } catch (error) {
      if (!(error instanceof SaldoInsuficienteError)) throw error;
      const disponible = tipoSaldo === 'REAL' ? saldos.real : saldos.bono;
      throw errorApuestas(
        'SALDO_INSUFICIENTE',
        `Saldo insuficiente: tienes ${aTexto(disponible)} disponibles.`,
        {
          saldoDisponible: aTexto(disponible),
        },
      );
    }
  }

  private anunciar(usuarioId: string, apuesta: ApuestaDto): void {
    const evento: ApuestaAceptada = {
      usuarioId,
      apuestaId: apuesta.id,
      monto: apuesta.monto,
      tipoSaldo: apuesta.tipoSaldo,
    };
    this.eventos.emit(EVENTOS.apuestaAceptada, evento);
  }

  /** Trabajo con retardo, persistente en Redis: sobrevive a un reinicio de la API (research.md §6). */
  private async encolar({ solicitudId, ejecutarEn }: SolicitudVivoAceptadaDto): Promise<void> {
    try {
      await this.colaVivo.add(
        'resolver',
        { solicitudId },
        {
          jobId: `vivo-${solicitudId}`,
          delay: Math.max(0, new Date(ejecutarEn).getTime() - Date.now()),
          attempts: INTENTOS_TRABAJO_VIVO,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      this.logger.error(`No se pudo encolar la apuesta en vivo ${solicitudId}: ${String(error)}`);
      await this.rechazarSolicitud(solicitudId, null, 'ERROR_INTERNO');
      throw new ServiceUnavailableException(
        'No se pudo registrar la apuesta en vivo. Inténtalo de nuevo.',
      );
    }
  }

  private async rechazarSolicitud(
    solicitudId: string,
    usuarioId: string | null,
    motivo: string,
  ): Promise<void> {
    const { count } = await this.prisma.solicitudApuestaVivo.updateMany({
      where: { id: solicitudId, estado: 'EN_ESPERA' },
      data: { estado: 'RECHAZADA', motivoRechazo: motivo },
    });
    if (count > 0 && usuarioId) {
      this.notificador.apuestaVivoResuelta(usuarioId, { solicitudId, estado: 'RECHAZADA', motivo });
    }
  }
}

/** Serializa en la transacción todas las apuestas del mismo usuario (research.md §4, paso 1). */
async function bloquearUsuario(tx: ClienteTransaccional, usuarioId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${usuarioId}))`;
}

/**
 * Pre-partido: partido programado, mercado abierto y antes de la hora de inicio según el reloj del servidor
 * (FR-017). En vivo: partido en vivo y mercado abierto (al empezar se cierran los que no admiten vivo).
 */
function exigirAbierto(vigente: SeleccionVigente): void {
  const mercadoAbierto = vigente.estado_mercado === 'ABIERTO';
  const prePartido =
    vigente.estado_partido === 'PROGRAMADO' &&
    vigente.inicio_en.getTime() > vigente.ahora.getTime();
  const enVivo = vigente.estado_partido === 'EN_VIVO';
  if (!mercadoAbierto || !(prePartido || enVivo)) {
    throw errorApuestas(
      'MERCADO_CERRADO',
      'Este mercado ya no acepta apuestas: el partido empezó o el mercado está suspendido.',
      { seleccionId: vigente.seleccion_id },
    );
  }
}

/** Si alguna cuota cambió, no se acepta en silencio: se devuelven las vigentes para reconfirmar (FR-016). */
function exigirCuotasVistas(solicitud: SolicitudApuesta, vigentes: SeleccionVigente[]): void {
  const cambio = solicitud.selecciones.some(
    (pedida, i) => !pedida.cuotaVista.equals(new Decimal(vigentes[i]!.cuota)),
  );
  if (cambio) {
    throw errorApuestas(
      'CUOTA_CAMBIADA',
      'La cuota cambió. Revisa las cuotas nuevas y confirma otra vez.',
      {
        cuotasVigentes: vigentes.map((v) => ({
          seleccionId: v.seleccion_id,
          cuota: aTexto(new Decimal(v.cuota)),
        })),
      },
    );
  }
}

/** En vivo: si el partido cambió durante el retardo (gol, estado o cuota), la apuesta no se acepta (FR-018). */
function exigirMismaVersion(
  vigentes: SeleccionVigente[],
  versiones: Readonly<Record<string, number>>,
): void {
  const cambio = vigentes.some(
    (v) => v.estado_partido === 'EN_VIVO' && v.version !== versiones[v.partido_id],
  );
  if (cambio) {
    throw errorApuestas(
      'MERCADO_CERRADO',
      'El partido cambió mientras esperabas la confirmación: la apuesta no se aceptó.',
      { motivo: 'MARCADOR_CAMBIO' },
    );
  }
}

function motivoDe(error: ErrorNegocio | NotFoundException): string {
  if (error instanceof NotFoundException) return 'SELECCION_INEXISTENTE';
  const motivo = error.datos['motivo'];
  return typeof motivo === 'string' ? motivo : error.codigo;
}
