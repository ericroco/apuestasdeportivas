import { Inject, Injectable, Optional } from '@nestjs/common';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type {
  EfectoPromocion,
  PromocionesApuestaPort,
  SolicitudPromocionApuesta,
} from '../contracts/promociones.port.js';
import type { Cupon } from '../generated/prisma/client.js';
import { BonosService } from './bonos.service.js';
import { CanjeService, type SolicitudCanje } from './canje.service.js';
import { bloquearCuponPorCodigo } from './cupon.bloqueo.js';
import { FORMATO_CODIGO, normalizarCodigo } from './cupones.esquemas.js';
import { CuponRechazadoError } from './motivos.js';
import { calcularCuotaFinal, motivoDeApuesta, motivoDeDisponibilidad } from './reglas-canje.js';

/**
 * Implementación del contrato 4 para el Spec 3. Corre dentro de la transacción de la apuesta: bloquea el cupón
 * (`SELECT … FOR UPDATE`), valida con el reloj del servidor y consume el canje en ese `tx`; si la apuesta se
 * revierte, el canje y el bono también (FR-008). Rechaza con `CuponInvalidoError` y un motivo legible.
 */
@Injectable()
export class PromocionesApuestaAdapter implements PromocionesApuestaPort {
  private readonly reloj: Reloj;

  constructor(
    private readonly canje: CanjeService,
    private readonly bonos: BonosService,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  async aplicarAApuesta(
    tx: ClienteTransaccional,
    solicitud: SolicitudPromocionApuesta,
  ): Promise<EfectoPromocion> {
    validarSolicitud(solicitud);
    const cupon = await this.cuponDisponible(tx, solicitud);
    // Apuesta gratis: sin billetera ni auditoría no se consume nada (503 antes de escribir).
    const dependencias = cupon.tipo === 'APUESTA_GRATIS' ? this.bonos.dependencias() : null;
    const solicitudCanje: SolicitudCanje = { usuarioId: solicitud.usuarioId, origen: 'APUESTA' };
    const motivo = await this.canje.motivoDelUsuario(tx, cupon, solicitudCanje, { alertar: true });
    if (motivo) throw new CuponRechazadoError(motivo);
    const canje = await this.canje.registrarAceptado(tx, cupon, solicitudCanje);
    if (dependencias) {
      await this.bonos.otorgar(
        tx,
        { cupon, canje, monto: solicitud.monto, actorId: solicitud.usuarioId },
        dependencias,
      );
      return { cuponId: cupon.id, tipoSaldo: 'BONO', cuotaFinal: solicitud.cuotaTotal };
    }
    return {
      cuponId: cupon.id,
      tipoSaldo: 'REAL',
      cuotaFinal: cupon.porcentaje
        ? calcularCuotaFinal(solicitud.cuotaTotal, cupon.porcentaje)
        : solicitud.cuotaTotal,
    };
  }

  /** Bloquea el cupón y aplica las reglas que no dependen del usuario. */
  private async cuponDisponible(
    tx: ClienteTransaccional,
    solicitud: SolicitudPromocionApuesta,
  ): Promise<Cupon> {
    const codigo = normalizarCodigo(solicitud.codigoCupon);
    const cupon = FORMATO_CODIGO.test(codigo) ? await bloquearCuponPorCodigo(tx, codigo) : null;
    if (!cupon) throw new CuponRechazadoError('CUPON_INEXISTENTE');
    const motivo =
      motivoDeDisponibilidad(cupon, this.reloj.ahora()) ?? motivoDeApuesta(cupon, solicitud.monto);
    if (motivo) throw new CuponRechazadoError(motivo);
    return cupon;
  }
}

/** Defensa ante un uso incorrecto del puerto por el Spec 3 (no es un motivo para el apostador). */
function validarSolicitud(solicitud: SolicitudPromocionApuesta): void {
  if (!solicitud.monto.gt(0) || solicitud.monto.decimalPlaces() > 2) {
    throw new RangeError('El monto de la apuesta debe ser positivo y con hasta dos decimales');
  }
  if (solicitud.cuotaTotal.lt(1)) {
    throw new RangeError('La cuota total de la apuesta debe ser al menos 1.00');
  }
}
