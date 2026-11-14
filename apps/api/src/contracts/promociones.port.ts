/**
 * Puertos de promociones y riesgo.
 * Provee: Spec 4 (Erick). Consumen: Spec 3 (cupones al crear una apuesta) y Spec 2 (riesgo al pedir un retiro).
 *
 * Reglas del contrato (docs/equipo/contratos.md §4):
 * - Los consumidores inyectan estos puertos con `@Optional()`: si el Spec 4 aún no está integrado, el Spec 3
 *   rechaza apuestas con cupón y el Spec 2 trata todo retiro sobre el umbral como "requiere revisión".
 * - `aplicarAApuesta` corre dentro de la transacción de la apuesta y consume el cupón en ella: si la apuesta
 *   falla, el cupón no queda usado.
 */
import type { ClienteTransaccional, Monto, TipoSaldo } from './billetera.port.js';

export interface SolicitudPromocionApuesta {
  readonly usuarioId: string;
  readonly codigoCupon: string;
  readonly monto: Monto;
  /** Cuota total congelada de la apuesta antes de aplicar el cupón. */
  readonly cuotaTotal: Monto;
}

export interface EfectoPromocion {
  readonly cuponId: string;
  /** `BONO` para apuestas gratis; `REAL` en el resto. */
  readonly tipoSaldo: TipoSaldo;
  /** Cuota final tras un aumento de cuota; igual a `cuotaTotal` si el cupón no la modifica. */
  readonly cuotaFinal: Monto;
}

export class CuponInvalidoError extends Error {
  override readonly name = 'CuponInvalidoError';
}

export interface PromocionesApuestaPort {
  /** Valida y consume el cupón. Lanza `CuponInvalidoError` con un motivo legible si no aplica. */
  aplicarAApuesta(
    tx: ClienteTransaccional,
    solicitud: SolicitudPromocionApuesta,
  ): Promise<EfectoPromocion>;
}

export const PROMOCIONES_APUESTA_PORT = Symbol('PROMOCIONES_APUESTA_PORT');

export interface EvaluacionRiesgo {
  readonly requiereRevision: boolean;
  /** Reglas que se activaron, p. ej. `retiro_tras_deposito_sin_actividad`. */
  readonly motivos: readonly string[];
}

export interface RiesgoPort {
  evaluarRetiro(usuarioId: string, monto: Monto): Promise<EvaluacionRiesgo>;
}

export const RIESGO_PORT = Symbol('RIESGO_PORT');
