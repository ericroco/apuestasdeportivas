import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import type { ConfirmacionPasarela } from './pasarela.port.js';

const APROBADA = 3;
const CANCELADA = 2;

export type Veredicto =
  | { readonly resultado: 'aprobada' }
  | { readonly resultado: 'cancelada' }
  | { readonly resultado: 'discrepancia'; readonly motivo: string };

/** Decimal con 2 decimales → centavos enteros, sin pasar por coma flotante. */
export function aCentavos(monto: Prisma.Decimal): number {
  return monto.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * FR-047: solo se acredita si Payphone aprobó y el monto, la moneda y la referencia coinciden con la intención.
 * Cualquier diferencia es una posible manipulación (FR-049).
 */
export function verificarConfirmacion(
  intencion: { readonly id: string; readonly monto: Prisma.Decimal; readonly moneda: string },
  confirmacion: ConfirmacionPasarela,
): Veredicto {
  if (confirmacion.statusCode === CANCELADA) return { resultado: 'cancelada' };
  if (confirmacion.statusCode !== APROBADA || confirmacion.transactionStatus !== 'Approved') {
    return { resultado: 'discrepancia', motivo: `estado desconocido (${confirmacion.statusCode})` };
  }
  if (confirmacion.clientTransactionId !== intencion.id) {
    return { resultado: 'discrepancia', motivo: 'la referencia no coincide' };
  }
  if (confirmacion.amount !== aCentavos(intencion.monto)) {
    return { resultado: 'discrepancia', motivo: 'el monto no coincide' };
  }
  if ((confirmacion.currency ?? 'USD').toUpperCase() !== intencion.moneda) {
    return { resultado: 'discrepancia', motivo: 'la moneda no coincide' };
  }
  return { resultado: 'aprobada' };
}

/** Método y titular del pago (research §10), con una huella para no duplicarlo. */
export function metodoDeLaConfirmacion(c: ConfirmacionPasarela) {
  const tipo = c.cardBrand ? ('TARJETA' as const) : ('APP_PAYPHONE' as const);
  const datos = {
    tipo,
    marca: c.cardBrand ?? null,
    ultimosDigitos: c.lastDigits ?? null,
    titularNombre: c.optionalParameter4 ?? null,
    titularDocumento: c.document ?? null,
    telefono: c.phoneNumber ?? null,
  };
  const huella = createHash('sha256')
    .update(
      [tipo, datos.marca, datos.ultimosDigitos, datos.titularDocumento, datos.telefono].join('|'),
    )
    .digest('hex');
  return { ...datos, huella };
}
