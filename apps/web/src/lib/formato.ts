/**
 * Formato de lo que devuelven la API y reportes. Los montos llegan como texto decimal y se formatean con
 * `Intl.NumberFormat` sobre el mismo texto (decimal exacto): la web no los convierte a `number` ni calcula.
 */

const LOCALE = 'es-EC';

/** Ecuador continental no tiene horario de verano: UTC−5 todo el año. */
export const ZONA_HORARIA = 'America/Guayaquil';
const DESPLAZAMIENTO_LOCAL = '-05:00';
const MS_DESPLAZAMIENTO = 5 * 60 * 60 * 1000;

const formatoMonto = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD' });
const formatoPorcentaje = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const formatoCuota = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatoEntero = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeZone: ZONA_HORARIA,
});
const formatoFechaHora = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: ZONA_HORARIA,
});
const formatoDia = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** El texto ya pasó por el esquema decimal de la respuesta; Intl lo trata como decimal exacto. */
function comoDecimal(texto: string): Intl.StringNumericLiteral {
  return texto as Intl.StringNumericLiteral;
}

export function formatearMonto(texto: string): string {
  return formatoMonto.format(comoDecimal(texto));
}

export function formatearPorcentaje(texto: string): string {
  return `${formatoPorcentaje.format(comoDecimal(texto))} %`;
}

export function formatearCuota(texto: string): string {
  return formatoCuota.format(comoDecimal(texto));
}

export function formatearEntero(valor: number): string {
  return formatoEntero.format(valor);
}

export function formatearFecha(iso: string): string {
  return formatoFecha.format(new Date(iso));
}

export function formatearFechaHora(iso: string): string {
  return formatoFechaHora.format(new Date(iso));
}

/** Día del calendario `AAAA-MM-DD` (UTC, como los agrupa reportes), p. ej. "1 dic". */
export function formatearDia(dia: string): string {
  return formatoDia.format(new Date(`${dia}T00:00:00Z`));
}

/** Valor para un `<input type="datetime-local">` en la hora de Ecuador. */
export function aFechaHoraLocal(iso: string): string {
  return new Date(Date.parse(iso) - MS_DESPLAZAMIENTO).toISOString().slice(0, 16);
}

/** Convierte la hora de Ecuador de un `datetime-local` a ISO 8601 UTC; `null` si no es una fecha real. */
export function aIsoDesdeLocal(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const instante = Date.parse(`${local}:00${DESPLAZAMIENTO_LOCAL}`);
  if (Number.isNaN(instante)) return null;
  const iso = new Date(instante).toISOString();
  // `Date` acepta el 30 de febrero y lo corre a marzo: se exige que la fecha vuelva igual.
  return aFechaHoraLocal(iso) === local ? iso : null;
}
