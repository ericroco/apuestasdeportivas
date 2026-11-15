import {
  construirConsulta,
  esFechaCalendario,
  primerValor,
  type ParametrosBusqueda,
} from '@/lib/parametros';

/**
 * Filtros del dashboard en la URL (`?desde=&hasta=&deporte=&competicionId=&usuario=`), para compartir la
 * vista. La web valida el formato; el orden del rango y su máximo de 366 días los valida reportes.
 */

export interface FiltrosReporte {
  /** Día `AAAA-MM-DD` (UTC), incluido. */
  readonly desde: string;
  /** Día `AAAA-MM-DD` (UTC), incluido. */
  readonly hasta: string;
  readonly deporte?: string;
  readonly competicionId?: string;
  /** Identificador (uuid) o correo exacto. */
  readonly usuario?: string;
}

export type LecturaFiltrosReporte =
  | { readonly ok: true; readonly filtros: FiltrosReporte }
  | { readonly ok: false; readonly errores: readonly string[]; readonly filtros: FiltrosReporte };

/** Días del rango por defecto, contando hoy: los últimos 30 días. */
const DIAS_POR_DEFECTO = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const DEPORTE = /^[\p{L}\p{N} _-]{1,50}$/u;

/** `hoy` en UTC (`AAAA-MM-DD`) y los 29 días anteriores. */
export function rangoPorDefecto(hoy: string): { readonly desde: string; readonly hasta: string } {
  const inicio = new Date(Date.parse(`${hoy}T00:00:00Z`) - (DIAS_POR_DEFECTO - 1) * MS_DIA);
  return { desde: inicio.toISOString().slice(0, 10), hasta: hoy };
}

function leerFecha(
  parametros: ParametrosBusqueda,
  clave: 'desde' | 'hasta',
  porDefecto: string,
): { readonly valor: string; readonly error?: string } {
  const valor = primerValor(parametros, clave);
  if (valor === undefined) return { valor: porDefecto };
  if (esFechaCalendario(valor)) return { valor };
  const nombre = clave === 'desde' ? 'inicio' : 'fin';
  return { valor, error: `La fecha de ${nombre} no es válida: usa el formato AAAA-MM-DD.` };
}

function leerOpcional(
  parametros: ParametrosBusqueda,
  clave: string,
  valido: (valor: string) => boolean,
  error: string,
): { readonly valor?: string; readonly error?: string } {
  const valor = primerValor(parametros, clave);
  if (valor === undefined) return {};
  return valido(valor) ? { valor } : { valor, error };
}

export function leerFiltrosReporte(
  parametros: ParametrosBusqueda,
  hoy: string,
): LecturaFiltrosReporte {
  const rango = rangoPorDefecto(hoy);
  const desde = leerFecha(parametros, 'desde', rango.desde);
  const hasta = leerFecha(parametros, 'hasta', rango.hasta);
  const deporte = leerOpcional(
    parametros,
    'deporte',
    (v) => DEPORTE.test(v),
    'El deporte solo lleva letras, números, espacios o guiones.',
  );
  const competicion = leerOpcional(
    parametros,
    'competicionId',
    (v) => UUID.test(v),
    'La competición debe ser un identificador válido; elígela desde el desglose.',
  );
  const usuario = leerOpcional(
    parametros,
    'usuario',
    (v) => UUID.test(v) || CORREO.test(v),
    'El usuario se busca por su identificador o por su correo exacto.',
  );
  const filtros: FiltrosReporte = {
    desde: desde.valor,
    hasta: hasta.valor,
    deporte: deporte.valor,
    competicionId: competicion.valor,
    usuario: usuario.valor,
  };
  const errores = [desde, hasta, deporte, competicion, usuario].flatMap((campo) =>
    campo.error ? [campo.error] : [],
  );
  return errores.length === 0 ? { ok: true, filtros } : { ok: false, errores, filtros };
}

export function consultaReporte(
  { desde, hasta, deporte, competicionId, usuario }: FiltrosReporte,
  extra: Readonly<Record<string, string>> = {},
): string {
  return construirConsulta({ desde, hasta, deporte, competicionId, usuario, ...extra });
}

export function hrefReportes(filtros: FiltrosReporte): string {
  return `/admin/reportes${consultaReporte(filtros)}`;
}

export type FormatoExportacion = 'csv' | 'pdf';

export function hrefExportacion(filtros: FiltrosReporte, formato: FormatoExportacion): string {
  return `/admin/reportes/exportar${consultaReporte(filtros, { formato })}`;
}
