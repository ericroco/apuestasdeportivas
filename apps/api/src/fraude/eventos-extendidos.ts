import type { ApuestaAceptada, DepositoConfirmado } from '../contracts/eventos.js';

/**
 * Campos que el Spec 4 propone agregar a eventos de otros specs (specs/004-…/contracts/cambios-contratos.md). Se
 * leen como opcionales sin editar `src/contracts/`: hasta que el dueño los agregue, llegan ausentes.
 */
export type DepositoConfirmadoExtendido = DepositoConfirmado & {
  /** Spec 2: SHA-256 en hex del identificador del medio de pago. Sin él no aplican las reglas de método de pago. */
  readonly metodoPagoHuella?: string | null;
};

export type ApuestaAceptadaExtendida = ApuestaAceptada & {
  /** Spec 3: cuota total congelada. Sin ella la apuesta no suma rollover (falla segura). */
  readonly cuotaTotal?: string | null;
};
