import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Dinero y cuotas: siempre Decimal, nunca `number` (constitución, principio II). Montos y cuotas con dos
 * decimales y redondeo ROUND_HALF_UP (research.md §4). En la API viajan como texto decimal ("10.50").
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

const DECIMALES = 2;
const PATRON_DECIMAL = /^\d+(\.\d{1,2})?$/;

export function redondear(valor: Decimal): Decimal {
  return valor.toDecimalPlaces(DECIMALES, Decimal.ROUND_HALF_UP);
}

/** Producto de los factores, redondeado una sola vez al final. */
export function multiplicar(...factores: readonly Decimal[]): Decimal {
  return redondear(factores.reduce((producto, factor) => producto.times(factor), new Decimal(1)));
}

/** Texto con exactamente dos decimales, p. ej. "10.50". */
export function aTexto(valor: Decimal): string {
  return valor.toFixed(DECIMALES, Decimal.ROUND_HALF_UP);
}

const textoDecimal = z
  .string()
  .regex(PATRON_DECIMAL, 'debe ser un número decimal con hasta dos decimales, p. ej. "10.50"')
  .transform((valor) => new Decimal(valor));

/** Monto positivo enviado como texto decimal. */
export const montoTexto = textoDecimal.refine((monto) => monto.greaterThan(0), {
  message: 'debe ser mayor que 0',
});

/** Cuota decimal mayor a 1.00 enviada como texto. */
export const cuotaTexto = textoDecimal.refine((cuota) => cuota.greaterThan(1), {
  message: 'debe ser mayor que 1.00',
});
