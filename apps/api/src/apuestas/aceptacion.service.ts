import { randomUUID } from 'node:crypto';
import type { ApuestaDto } from '@apuestas/shared';
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DatosCliente } from '../comun/contexto-accion.js';
import { aTexto, Decimal } from '../comun/decimal.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
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
  type TipoSaldo,
  type UsuarioAutenticado,
} from '../contracts/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
  ahora: Date;
}

interface Efecto {
  readonly tipoSaldo: TipoSaldo;
  readonly cuotaTotal: Decimal;
  readonly cuponId: string | null;
}

export interface ResultadoAceptacion {
  readonly apuesta: ApuestaDto;
  /** `false` si la claveSolicitud ya se había usado: es la misma apuesta, sin efectos nuevos (FR-020). */
  readonly nueva: boolean;
}

/** Varias solicitudes del mismo usuario esperan su turno en el bloqueo: hace falta margen. */
const OPCIONES_TRANSACCION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 15_000,
} as const;

const ROLES_SIN_APUESTAS = ['OPERADOR', 'ADMINISTRADOR'] as const;

/**
 * Aceptación atómica de apuestas pre-partido (research.md §4, FR-015 a FR-022): validar, descontar y registrar en
 * UNA transacción. Si cualquier paso falla, no queda apuesta ni movimiento de dinero. Los valores del cliente
 * (cuota vista) solo se comparan; los que cuentan se leen del servidor.
 */
@Injectable()
export class AceptacionService {
  private readonly limites: Limites;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLETERA_PORT) private readonly billetera: BilleteraPort,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly eventos: EventEmitter2,
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
      throw new ErrorNegocio(
        'ROL_NO_PUEDE_APOSTAR',
        'Los operadores y administradores no pueden apostar.',
      );
    }
    const resultado = await this.prisma.$transaction(
      (tx) => this.aceptarEnTransaccion(tx, usuario.id, solicitud, cliente),
      OPCIONES_TRANSACCION,
    );
    // Solo después del commit: nunca se anuncia una apuesta que se revirtió (FR-024).
    if (resultado.nueva) {
      const evento: ApuestaAceptada = {
        usuarioId: usuario.id,
        apuestaId: resultado.apuesta.id,
        monto: resultado.apuesta.monto,
        tipoSaldo: resultado.apuesta.tipoSaldo,
      };
      this.eventos.emit(EVENTOS.apuestaAceptada, evento);
    }
    return resultado;
  }

  private async aceptarEnTransaccion(
    tx: ClienteTransaccional,
    usuarioId: string,
    solicitud: SolicitudApuesta,
    cliente: DatosCliente,
  ): Promise<ResultadoAceptacion> {
    // 1. Serializa las apuestas del mismo usuario: límite diario, saldo negativo y reenvíos sin carreras.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${usuarioId}))`;

    // 2. Idempotencia de la solicitud (doble clic, reintento de red).
    const repetida = await tx.apuesta.findUnique({
      where: { usuarioId_claveSolicitud: { usuarioId, claveSolicitud: solicitud.claveSolicitud } },
      include: INCLUIR_SELECCIONES,
    });
    if (repetida) return { apuesta: aApuestaDto(repetida), nueva: false };

    // 3 y 4. Selecciones con FOR SHARE (la cuota comparada es la que se congela) y validaciones.
    const vigentes = await this.leerSelecciones(tx, solicitud);
    const cuotaBase = calcularCuotaTotal(vigentes.map((v) => new Decimal(v.cuota)));
    const saldos = await this.billetera.obtenerSaldos(usuarioId, tx);
    if (saldos.real.isNegative() || saldos.bono.isNegative()) {
      throw new ErrorNegocio(
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

    // 5. Cupón opcional (contrato 4), dentro de la misma transacción.
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

    // 6. Registrar la apuesta con las cuotas congeladas.
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
        enVivo: false,
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

    // 7. Descontar: la billetera bloquea su fila y lanza SaldoInsuficienteError.
    await this.debitar(tx, usuarioId, apuestaId, solicitud.monto, efecto.tipoSaldo, saldos);

    // 8. Auditoría en la misma transacción.
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
          selecciones: vigentes.map((v) => ({ seleccionId: v.seleccion_id, cuota: v.cuota })),
          cuponId: efecto.cuponId,
        },
        ...cliente,
      },
      tx,
    );
    return { apuesta: aApuestaDto(apuesta), nueva: true };
  }

  private async leerSelecciones(
    tx: ClienteTransaccional,
    solicitud: SolicitudApuesta,
  ): Promise<SeleccionVigente[]> {
    const ids = solicitud.selecciones.map((s) => s.seleccionId);
    const filas = await tx.$queryRaw<SeleccionVigente[]>`
      SELECT s.id::text AS seleccion_id, s.cuota::text AS cuota, m.estado::text AS estado_mercado,
             p.id::text AS partido_id, p.estado::text AS estado_partido, p.inicio_en, now() AS ahora
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
    for (const vigente of vigentes) this.exigirAbierto(vigente);
    this.exigirCuotasVistas(solicitud, vigentes);
    return vigentes;
  }

  /** Mercado abierto, partido programado y antes de la hora de inicio según el reloj del servidor (FR-017). */
  private exigirAbierto(vigente: SeleccionVigente): void {
    if (vigente.estado_partido === 'EN_VIVO' && vigente.estado_mercado === 'ABIERTO') {
      // T055 (HU7): aceptación en vivo con retardo y revalidación.
      throw new ErrorNegocio(
        'MERCADO_CERRADO',
        'Las apuestas en vivo todavía no están disponibles.',
      );
    }
    const abierto =
      vigente.estado_partido === 'PROGRAMADO' &&
      vigente.estado_mercado === 'ABIERTO' &&
      vigente.inicio_en.getTime() > vigente.ahora.getTime();
    if (!abierto) {
      throw new ErrorNegocio(
        'MERCADO_CERRADO',
        'Este mercado ya no acepta apuestas: el partido empezó o el mercado está suspendido.',
        { seleccionId: vigente.seleccion_id },
      );
    }
  }

  /** Si alguna cuota cambió, no se acepta en silencio: se devuelven las vigentes para reconfirmar (FR-016). */
  private exigirCuotasVistas(solicitud: SolicitudApuesta, vigentes: SeleccionVigente[]): void {
    const cambio = solicitud.selecciones.some(
      (pedida, i) => !pedida.cuotaVista.equals(new Decimal(vigentes[i]!.cuota)),
    );
    if (cambio) {
      throw new ErrorNegocio(
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
      throw new ErrorNegocio(
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
      if (error instanceof CuponInvalidoError)
        throw new ErrorNegocio('CUPON_INVALIDO', error.message);
      throw error;
    }
  }

  private async debitar(
    tx: ClienteTransaccional,
    usuarioId: string,
    apuestaId: string,
    monto: Decimal,
    tipoSaldo: TipoSaldo,
    saldos: { real: Decimal; bono: Decimal },
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
      throw new ErrorNegocio(
        'SALDO_INSUFICIENTE',
        `Saldo insuficiente: tienes ${aTexto(disponible)} disponibles.`,
        { saldoDisponible: aTexto(disponible) },
      );
    }
  }
}
