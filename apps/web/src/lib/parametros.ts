/** Lectura de los parámetros de la URL (filtros compartibles) y armado de consultas. */

export type ParametrosBusqueda = Readonly<Record<string, string | string[] | undefined>>;

export type ValoresConsulta = Readonly<Record<string, string | number | null | undefined>>;

const PAGINA_MAXIMA = 10_000;

/** Primer valor no vacío de un parámetro, sin espacios en los extremos. */
export function primerValor(parametros: ParametrosBusqueda, clave: string): string | undefined {
  const valor = parametros[clave];
  const texto = (Array.isArray(valor) ? valor[0] : valor)?.trim();
  return texto ? texto : undefined;
}

/** Valor del parámetro solo si es uno de los permitidos (un valor manipulado se ignora). */
export function valorPermitido<T extends string>(
  parametros: ParametrosBusqueda,
  clave: string,
  permitidos: readonly T[],
): T | undefined {
  const valor = primerValor(parametros, clave);
  return permitidos.find((permitido) => permitido === valor);
}

export function leerPagina(parametros: ParametrosBusqueda): number {
  const valor = primerValor(parametros, 'pagina');
  if (!valor || !/^\d{1,5}$/.test(valor)) return 1;
  const pagina = Number(valor);
  return pagina >= 1 && pagina <= PAGINA_MAXIMA ? pagina : 1;
}

/** `?a=1&b=x` con los valores presentes, o `''` si no hay ninguno. */
export function construirConsulta(valores: ValoresConsulta): string {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(clave, String(valor));
  }
  const texto = consulta.toString();
  return texto ? `?${texto}` : '';
}

/** `AAAA-MM-DD` que existe en el calendario (rechaza `2026-02-30`). */
export function esFechaCalendario(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
}

export function fechaCalendario(parametros: ParametrosBusqueda, clave: string): string | undefined {
  const valor = primerValor(parametros, clave);
  return valor && esFechaCalendario(valor) ? valor : undefined;
}

/** Identificador de una ruta dinámica (uuid u otro id opaco) antes de pedirlo a la API. */
export function esIdentificador(valor: string): boolean {
  return /^[\w-]{1,64}$/.test(valor);
}
