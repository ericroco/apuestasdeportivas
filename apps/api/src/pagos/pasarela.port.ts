/** Pasarela de pagos (research §9). En producción, Payphone; en las pruebas, un doble. */

export interface SolicitudPreparar {
  /** Entero en centavos (Payphone no acepta decimales). */
  readonly montoCentavos: number;
  /** Id de la intención: el `clientTransactionId` de Payphone. */
  readonly referencia: string;
  readonly urlRespuesta: string;
  readonly urlCancelacion: string;
}

export interface PagoPreparado {
  readonly paymentId: string;
  /** URL a la que se redirige al usuario para pagar. */
  readonly urlPago: string;
}

/** Campos de la respuesta de `V2/Confirm` que usa el sistema (los nombres son los de Payphone). */
export interface ConfirmacionPasarela {
  readonly statusCode: number;
  readonly transactionStatus: string;
  readonly transactionId: number;
  readonly clientTransactionId: string;
  /** Centavos. */
  readonly amount: number;
  readonly currency?: string;
  readonly cardBrand?: string;
  readonly lastDigits?: string;
  readonly document?: string;
  readonly phoneNumber?: string;
  /** Nombre del titular en los pagos con tarjeta. */
  readonly optionalParameter4?: string;
}

export interface PasarelaPort {
  preparar(solicitud: SolicitudPreparar): Promise<PagoPreparado>;
  confirmar(id: number, referencia: string): Promise<ConfirmacionPasarela>;
  reversar(transactionId: number): Promise<void>;
}

export const PASARELA_PORT = Symbol('PASARELA_PORT');

export class PasarelaNoDisponibleError extends Error {
  override readonly name = 'PasarelaNoDisponibleError';
}
