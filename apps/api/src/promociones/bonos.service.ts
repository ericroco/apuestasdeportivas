import { Inject, Injectable, Optional } from '@nestjs/common';
import { requerir } from '../comun/dependencias.js';
import { CERO, aTexto, type Decimal } from '../comun/montos.js';
import { esViolacionDeUnicidad } from '../comun/prisma-errores.js';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import {
  BILLETERA_PORT,
  type BilleteraPort,
  type ClienteTransaccional,
} from '../contracts/billetera.port.js';
import type { Bono, CanjeCupon, Cupon } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CanjeService, type SolicitudCanje } from './canje.service.js';
import { claveDeBono } from './claves-idempotencia.js';
import { bloquearCuponPorCodigo } from './cupon.bloqueo.js';
import { FORMATO_CODIGO, normalizarCodigo } from './cupones.esquemas.js';
import { CuponRechazadoError, type CodigoMotivo } from './motivos.js';
import {
  calcularBonoDeposito,
  calcularRequisito,
  calcularVencimiento,
  motivoDeDeposito as motivoDeDepositoDelCupon,
  motivoDeDisponibilidad,
} from './reglas-canje.js';

/** `canje_cupon.codigo` es varchar(40): un código más largo se guarda recortado (y no existe). */
const LARGO_MAXIMO_CODIGO = 40;

/** Puertos del Spec 2 que mueven dinero y auditan; sin ellos ningún bono se otorga (research.md §7). */
export interface DependenciasBono {
  readonly billetera: BilleteraPort;
  readonly auditoria: AuditoriaPort;
}

/** Depósito confirmado ya validado (bonos.listener.ts). */
export interface DepositoParaBono {
  readonly usuarioId: string;
  readonly depositoId: string;
  readonly monto: Decimal;
  readonly codigoCupon: string | null;
  readonly metodoPagoHuella: string | null;
}

/** Qué pasó con el cupón de un depósito: otorgado, ya procesado, sin cupón o el motivo del rechazo. */
export type ResultadoBonoDeposito = 'OTORGADO' | 'YA_PROCESADO' | 'SIN_CUPON' | CodigoMotivo;

export interface DatosOtorgamiento {
  readonly cupon: Cupon;
  readonly canje: CanjeCupon;
  readonly monto: Decimal;
  /** Usuario que provoca el bono (apuesta gratis) o `null` si lo otorga un proceso del sistema (depósito). */
  readonly actorId: string | null;
}

/** Bonos y su requisito de rollover (FR-011). Todo movimiento de dinero va por la billetera del Spec 2. */
@Injectable()
export class BonosService {
  private readonly reloj: Reloj;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly canje: CanjeService,
    @Inject(ENTORNO) protected readonly entorno: Entorno,
    @Optional() @Inject(BILLETERA_PORT) private readonly billetera?: BilleteraPort,
    @Optional() @Inject(AUDITORIA_PORT) private readonly auditoria?: AuditoriaPort,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  /** Lanza `DependenciaNoDisponibleError` (503) si falta la billetera o la auditoría. Llamar antes de escribir. */
  dependencias(): DependenciasBono {
    return {
      billetera: requerir(this.billetera, 'billetera'),
      auditoria: requerir(this.auditoria, 'auditoría'),
    };
  }

  /**
   * Crea el bono ACTIVO, acredita su monto como saldo de bono con la clave `cupon:<cuponId>:<usuarioId>:<n>:bono` y
   * audita `bono.otorgado`, todo en `tx`: si la operación que lo origina se revierte, el bono también.
   */
  async otorgar(
    tx: ClienteTransaccional,
    datos: DatosOtorgamiento,
    dependencias: DependenciasBono = this.dependencias(),
  ): Promise<Bono> {
    const { cupon, canje, monto } = datos;
    const bono = await this.crearBono(tx, datos);
    await dependencias.billetera.acreditarBono(tx, {
      usuarioId: canje.usuarioId,
      monto,
      claveIdempotencia: claveDeBono(cupon.id, canje.usuarioId, canje.numero),
      referencia: cupon.id,
    });
    await dependencias.auditoria.registrar(
      {
        actorId: datos.actorId,
        accion: 'bono.otorgado',
        entidad: 'bono',
        entidadId: bono.id,
        datos: {
          usuarioId: canje.usuarioId,
          cuponId: cupon.id,
          codigo: cupon.codigo,
          origen: canje.origen,
          monto: aTexto(monto),
          requisito: aTexto(bono.requisito),
          venceEn: bono.venceEn.toISOString(),
        },
      },
      tx,
    );
    return bono;
  }

  /**
   * Bono de depósito (FR-010): con el cupón bloqueado, `min(depósito × porcentaje, tope)` si se cumplen las reglas;
   * si no, guarda el canje rechazado con su motivo. El depósito nunca se ve afectado. Idempotente por depósito:
   * la unicidad `(origen, referencia_id)` del canje impide un segundo bono aunque el evento llegue repetido.
   */
  async otorgarPorDeposito(deposito: DepositoParaBono): Promise<ResultadoBonoDeposito> {
    if (!deposito.codigoCupon) return 'SIN_CUPON';
    const codigo = normalizarCodigo(deposito.codigoCupon).slice(0, LARGO_MAXIMO_CODIGO);
    const dependencias = this.dependencias();
    const solicitud: SolicitudCanje = {
      usuarioId: deposito.usuarioId,
      origen: 'DEPOSITO',
      referenciaId: deposito.depositoId,
      metodoPagoHuella: deposito.metodoPagoHuella,
    };
    try {
      return await this.prisma.$transaction((tx) =>
        this.procesarDeposito(tx, codigo, deposito.monto, solicitud, dependencias),
      );
    } catch (error) {
      // Dos procesos del mismo depósito a la vez: el segundo choca con la unicidad del canje.
      if (esViolacionDeUnicidad(error)) return 'YA_PROCESADO';
      throw error;
    }
  }

  private async procesarDeposito(
    tx: ClienteTransaccional,
    codigo: string,
    monto: Decimal,
    solicitud: SolicitudCanje,
    dependencias: DependenciasBono,
  ): Promise<ResultadoBonoDeposito> {
    const cupon = FORMATO_CODIGO.test(codigo) ? await bloquearCuponPorCodigo(tx, codigo) : null;
    if (await this.depositoProcesado(tx, solicitud.referenciaId ?? '')) return 'YA_PROCESADO';
    const motivo = cupon
      ? await this.motivoDeDeposito(tx, cupon, monto, solicitud)
      : 'CUPON_INEXISTENTE';
    if (motivo !== null || cupon === null) {
      const rechazo = motivo ?? 'CUPON_INEXISTENTE';
      await this.canje.registrarRechazado(tx, { codigo, cupon }, solicitud, rechazo);
      return rechazo;
    }
    const canje = await this.canje.registrarAceptado(tx, cupon, solicitud);
    const bono = calcularBonoDeposito(monto, cupon.porcentaje ?? CERO, cupon.topeBono ?? CERO);
    await this.otorgar(tx, { cupon, canje, monto: bono, actorId: null }, dependencias);
    return 'OTORGADO';
  }

  private async depositoProcesado(tx: ClienteTransaccional, depositoId: string): Promise<boolean> {
    const previo = await tx.canjeCupon.findUnique({
      where: { origen_referenciaId: { origen: 'DEPOSITO', referenciaId: depositoId } },
    });
    return previo !== null;
  }

  private async motivoDeDeposito(
    tx: ClienteTransaccional,
    cupon: Cupon,
    monto: Decimal,
    solicitud: SolicitudCanje,
  ): Promise<CodigoMotivo | null> {
    return (
      motivoDeDisponibilidad(cupon, this.reloj.ahora()) ??
      motivoDeDepositoDelCupon(cupon, monto) ??
      (await this.canje.motivoDelUsuario(tx, cupon, solicitud, { alertar: true }))
    );
  }

  private async crearBono(tx: ClienteTransaccional, datos: DatosOtorgamiento): Promise<Bono> {
    const otorgadoEn = this.reloj.ahora();
    try {
      return await tx.bono.create({
        data: {
          usuarioId: datos.canje.usuarioId,
          cuponId: datos.cupon.id,
          canjeId: datos.canje.id,
          monto: datos.monto,
          requisito: calcularRequisito(datos.monto, this.entorno.CUPON_ROLLOVER_MULTIPLICADOR),
          otorgadoEn,
          venceEn: calcularVencimiento(otorgadoEn, this.entorno.BONO_VIGENCIA_DIAS),
        },
      });
    } catch (error) {
      // Índice único parcial: otro bono ACTIVO del usuario se confirmó primero (red de seguridad de FR-007).
      if (esViolacionDeUnicidad(error)) throw new CuponRechazadoError('BONO_ACTIVO');
      throw error;
    }
  }
}
