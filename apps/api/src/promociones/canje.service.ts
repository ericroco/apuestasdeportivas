import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import {
  BILLETERA_PORT,
  type BilleteraPort,
  type ClienteTransaccional,
} from '../contracts/billetera.port.js';
import { ActividadService } from '../fraude/actividad.service.js';
import { RegistroAlertasService } from '../fraude/registro-alertas.service.js';
import type { CanjeCupon, Cupon, OrigenCanje } from '../generated/prisma/client.js';
import { buscarBonoActivo } from './bono.consultas.js';
import type { CodigoMotivo } from './motivos.js';
import { otorgaBono } from './reglas-canje.js';

/** Quién canjea y desde qué operación. */
export interface SolicitudCanje {
  readonly usuarioId: string;
  readonly origen: OrigenCanje;
  /** `depositoId` en depósitos; en apuestas, la apuesta del Spec 3 guarda el cupón. */
  readonly referenciaId?: string | null;
  /** Solo depósitos: huella del método de pago (cambios-contratos.md §1). */
  readonly metodoPagoHuella?: string | null;
}

export interface OpcionesEvaluacion {
  /**
   * `true` al canjear: serializa los canjes de bono del usuario y un rechazo por cuenta múltiple crea la alerta.
   * `false` en la vista previa: solo lee.
   */
  readonly alertar: boolean;
}

interface CuentaMultiple {
  readonly otraCuenta: string;
  readonly dispositivos: readonly string[];
  readonly porMetodoPago: boolean;
}

/**
 * Reglas del canje que dependen del usuario y de la base, y alta del canje. Todo corre en el `tx` de quien canjea,
 * con la fila del cupón ya bloqueada (`cupon.bloqueo.ts`): el cupo y el límite por usuario se cuentan bajo ese
 * bloqueo (FR-005).
 */
@Injectable()
export class CanjeService {
  private readonly logger = new Logger(CanjeService.name);
  private readonly reloj: Reloj;

  constructor(
    private readonly actividad: ActividadService,
    private readonly alertas: RegistroAlertasService,
    @Optional() @Inject(BILLETERA_PORT) private readonly billetera?: BilleteraPort,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  /** Límite por usuario, bono activo, saldo de bono pendiente, usuario en revisión y cuenta múltiple (FR-004, FR-006, FR-007). */
  async motivoDelUsuario(
    tx: ClienteTransaccional,
    cupon: Cupon,
    solicitud: SolicitudCanje,
    opciones: OpcionesEvaluacion,
  ): Promise<CodigoMotivo | null> {
    const { usuarioId } = solicitud;
    if ((await this.aceptadosDelUsuario(tx, cupon, usuarioId)) >= cupon.limitePorUsuario) {
      return 'LIMITE_USUARIO';
    }
    if (otorgaBono(cupon.tipo)) {
      if (opciones.alertar) await this.bloquearBonosDelUsuario(tx, usuarioId);
      if (await buscarBonoActivo(tx, usuarioId, this.reloj.ahora())) return 'BONO_ACTIVO';
      if (await this.tieneSaldoBonoHuerfano(tx, usuarioId)) return 'SALDO_BONO_PENDIENTE';
      if (await this.alertas.tieneAlertaAltaVigente(usuarioId, tx)) return 'USUARIO_EN_REVISION';
    }
    const multiple = await this.buscarCuentaMultiple(tx, cupon, solicitud);
    if (!multiple) return null;
    if (opciones.alertar) this.alertarCuentaMultiple(cupon, usuarioId, multiple);
    return 'CUENTA_MULTIPLE';
  }

  /**
   * Sin bono activo, el saldo de bono que quede es de una promoción anterior (por ejemplo, de un bono vencido): otro
   * bono lo haría pasar por suyo al convertir. Sin billetera conectada no se puede saber y no se bloquea (otorgar
   * un bono ya exige la billetera).
   */
  private async tieneSaldoBonoHuerfano(
    tx: ClienteTransaccional,
    usuarioId: string,
  ): Promise<boolean> {
    if (!this.billetera) return false;
    const { bono } = await this.billetera.obtenerSaldos(usuarioId, tx);
    return bono.gt(0);
  }

  /** Guarda el n-ésimo canje aceptado del usuario y suma uno a los canjes del cupón. */
  async registrarAceptado(
    tx: ClienteTransaccional,
    cupon: Cupon,
    solicitud: SolicitudCanje,
  ): Promise<CanjeCupon> {
    const numero = (await this.aceptadosDelUsuario(tx, cupon, solicitud.usuarioId)) + 1;
    const canje = await tx.canjeCupon.create({
      data: { ...this.datosDelCanje(cupon, cupon.codigo, solicitud), estado: 'ACEPTADO', numero },
    });
    await tx.cupon.update({ where: { id: cupon.id }, data: { canjes: { increment: 1 } } });
    return canje;
  }

  /** Solo depósitos: en apuestas el rechazo se revierte con la transacción de la apuesta. */
  async registrarRechazado(
    tx: ClienteTransaccional,
    cuponOCodigo: { readonly codigo: string; readonly cupon: Cupon | null },
    solicitud: SolicitudCanje,
    motivo: CodigoMotivo,
  ): Promise<CanjeCupon> {
    const { cupon, codigo } = cuponOCodigo;
    return tx.canjeCupon.create({
      data: { ...this.datosDelCanje(cupon, codigo, solicitud), estado: 'RECHAZADO', motivo },
    });
  }

  private datosDelCanje(cupon: Cupon | null, codigo: string, solicitud: SolicitudCanje) {
    return {
      cuponId: cupon?.id ?? null,
      codigo,
      usuarioId: solicitud.usuarioId,
      origen: solicitud.origen,
      referenciaId: solicitud.referenciaId ?? null,
      metodoPagoHuella: solicitud.metodoPagoHuella ?? null,
    };
  }

  private aceptadosDelUsuario(
    tx: ClienteTransaccional,
    cupon: Cupon,
    usuarioId: string,
  ): Promise<number> {
    return tx.canjeCupon.count({ where: { cuponId: cupon.id, usuarioId, estado: 'ACEPTADO' } });
  }

  /**
   * Serializa los canjes que otorgan bono de un mismo usuario (aunque sean de cupones distintos) hasta el fin de la
   * transacción, para que dos canjes simultáneos no pasen ambos el control de "un bono activo a la vez". El índice
   * único parcial de bono activo queda como red de seguridad.
   */
  private async bloquearBonosDelUsuario(
    tx: ClienteTransaccional,
    usuarioId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bono:${usuarioId}`}, 0))`;
  }

  /** Otra cuenta que comparte dispositivo (o método de pago, en depósitos) ya canjeó este cupón (FR-006). */
  private async buscarCuentaMultiple(
    tx: ClienteTransaccional,
    cupon: Cupon,
    solicitud: SolicitudCanje,
  ): Promise<CuentaMultiple | null> {
    const huella = solicitud.origen === 'DEPOSITO' ? (solicitud.metodoPagoHuella ?? null) : null;
    const relacionadas = await this.actividad.cuentasRelacionadas(
      solicitud.usuarioId,
      { metodoPagoHuella: huella },
      tx,
    );
    const otras = [...new Set([...relacionadas.porDispositivo, ...relacionadas.porMetodoPago])];
    const criterios = [
      ...(otras.length ? [{ usuarioId: { in: otras } }] : []),
      ...(huella ? [{ metodoPagoHuella: huella }] : []),
    ];
    if (criterios.length === 0) return null;
    const previo = await tx.canjeCupon.findFirst({
      where: {
        cuponId: cupon.id,
        estado: 'ACEPTADO',
        usuarioId: { not: solicitud.usuarioId },
        OR: criterios,
      },
      select: { usuarioId: true },
    });
    if (!previo) return null;
    return {
      otraCuenta: previo.usuarioId,
      dispositivos: relacionadas.dispositivos,
      porMetodoPago: !relacionadas.porDispositivo.includes(previo.usuarioId),
    };
  }

  /**
   * La alerta se registra con el `PrismaService` y sin esperar: queda aunque la apuesta se revierta y no retiene
   * otra conexión mientras esta transacción tiene bloqueado el cupón.
   */
  private alertarCuentaMultiple(cupon: Cupon, usuarioId: string, multiple: CuentaMultiple): void {
    const alerta = {
      regla: 'CUPON_CUENTA_MULTIPLE' as const,
      severidad: 'ALTA' as const,
      usuarioId,
      claveDeduplicacion: `cupon:${usuarioId}:${cupon.id}`,
      evidencia: {
        cuponId: cupon.id,
        codigo: cupon.codigo,
        cuentas: [usuarioId, multiple.otraCuenta],
        dispositivos: multiple.dispositivos,
        porMetodoPago: multiple.porMetodoPago,
      },
    };
    Promise.resolve()
      .then(() => this.alertas.registrar(alerta))
      .catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.error(`No se pudo registrar la alerta de cuenta múltiple: ${mensaje}`);
      });
  }
}
