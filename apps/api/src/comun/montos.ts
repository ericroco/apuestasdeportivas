import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';

/** Dinero, porcentajes y cuotas: siempre `Prisma.Decimal`, nunca `number` (CONTRIBUTING.md §6). */
export type Decimal = Prisma.Decimal;

export const CERO: Decimal = new Prisma.Decimal(0);

/** Texto decimal positivo o cero con hasta dos decimales, como viaja en la API ("10.50"). */
export const textoDecimal = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'debe ser un número con hasta dos decimales, como "10.50"')
  .transform((valor) => new Prisma.Decimal(valor));

export const montoPositivo = textoDecimal.refine((monto) => monto.gt(0), 'debe ser mayor que 0');

/** Redondea a centésimos (mitad hacia arriba): montos y cuotas finales. */
export function redondear(valor: Decimal): Decimal {
  return valor.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Texto con dos decimales para las respuestas de la API. */
export function aTexto(valor: Decimal): string {
  return valor.toFixed(2);
}

export function aTextoONulo(valor: Decimal | null): string | null {
  return valor === null ? null : aTexto(valor);
}

/** Convierte texto decimal de un evento; `null` si no es un número decimal finito y no negativo. */
export function decimalDeEvento(valor: unknown): Decimal | null {
  if (typeof valor !== 'string' || !/^\d{1,12}(\.\d{1,4})?$/.test(valor)) return null;
  return new Prisma.Decimal(valor);
}
