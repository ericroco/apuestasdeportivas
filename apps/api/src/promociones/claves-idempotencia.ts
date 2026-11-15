/**
 * Claves de idempotencia de la billetera (contrato 2, convención `<entidad>:<id>:<operación>`). Repetir la
 * operación con la misma clave no crea otro asiento (FR-016).
 */

/** Bono otorgado por el n-ésimo canje aceptado del usuario en el cupón. */
export function claveDeBono(cuponId: string, usuarioId: string, numero: number | null): string {
  if (numero === null) throw new Error('Un canje aceptado siempre tiene número');
  return `cupon:${cuponId}:${usuarioId}:${numero}:bono`;
}

/** Conversión del saldo de bono en real al cumplir el rollover: una sola por bono. */
export function claveDeConversion(bonoId: string): string {
  return `bono:${bonoId}:conversion`;
}
