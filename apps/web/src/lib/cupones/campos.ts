import { z } from 'zod';
import { aIsoDesdeLocal } from '@/lib/formato';

/**
 * Campos de los formularios de cupones. Validan el formato en el servidor web para señalar qué corregir;
 * la API vuelve a validar todo y es la autoridad (constitución, principio III).
 */

const FORMATO_DECIMAL = /^\d{1,12}([.,]\d{1,2})?$/;
const FORMATO_ENTERO = /^\d{1,7}$/;

/** `"10"` → `"10.00"`, `"10,5"` → `"10.50"`: solo cambia el formato del texto, no calcula. */
export function normalizarDecimal(texto: string): string {
  const [entero, decimales = ''] = texto.replace(',', '.').split('.');
  return `${entero}.${decimales.padEnd(2, '0')}`;
}

function tieneValor(texto: string): boolean {
  return /[1-9]/.test(texto);
}

/** Texto decimal con hasta dos decimales; con `positivo`, mayor que 0. */
export function campoDecimal(mensaje: string, { positivo = false } = {}) {
  return z
    .string({ error: mensaje })
    .trim()
    .regex(FORMATO_DECIMAL, mensaje)
    .transform(normalizarDecimal)
    .refine((valor) => !positivo || tieneValor(valor), mensaje);
}

/** Porcentaje decimal dentro de un rango (la comparación solo valida, no se envía). */
export function campoPorcentaje(mensaje: string, minimo: number, maximo: number) {
  return campoDecimal(mensaje).refine((valor) => {
    const numero = Number(valor);
    return numero >= minimo && numero <= maximo;
  }, mensaje);
}

export function campoEntero(mensaje: string, minimo: number) {
  return z
    .string({ error: mensaje })
    .trim()
    .regex(FORMATO_ENTERO, mensaje)
    .transform(Number)
    .refine((valor) => valor >= minimo, mensaje);
}

/** Fecha y hora de un `datetime-local` (hora de Ecuador) convertida a ISO 8601 UTC. */
export function campoFechaHora(mensaje: string) {
  return z.string({ error: mensaje }).transform((valor, contexto) => {
    const iso = aIsoDesdeLocal(valor.trim());
    if (iso === null) {
      contexto.addIssue({ code: 'custom', message: mensaje });
      return z.NEVER;
    }
    return iso;
  });
}

/** Primer mensaje de error por campo. */
export function erroresPorCampo<C extends string>(error: z.ZodError): Partial<Record<C, string>> {
  const errores: Partial<Record<C, string>> = {};
  for (const problema of error.issues) {
    const campo = problema.path[0];
    if (typeof campo === 'string' && !(campo in errores)) {
      errores[campo as C] = problema.message;
    }
  }
  return errores;
}
