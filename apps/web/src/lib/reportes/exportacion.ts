import type { TipoFallo } from '@/lib/resultado';
import { primerValor, type ParametrosBusqueda } from '@/lib/parametros';
import type { FormatoExportacion } from './filtros';

/**
 * Motivos con los que el route handler de exportación vuelve al dashboard (`?exportacion=<motivo>`)
 * cuando no puede entregar el archivo.
 */
export const MOTIVOS_EXPORTACION = [
  'sin-sesion',
  'sin-permiso',
  'no-disponible',
  'rechazo',
  'filtros',
] as const satisfies readonly (TipoFallo | 'filtros')[];

export type MotivoExportacion = (typeof MOTIVOS_EXPORTACION)[number];

export function leerMotivoExportacion(
  parametros: ParametrosBusqueda,
): MotivoExportacion | undefined {
  const valor = primerValor(parametros, 'exportacion');
  return MOTIVOS_EXPORTACION.find((motivo) => motivo === valor);
}

export function leerFormato(parametros: ParametrosBusqueda): FormatoExportacion | null {
  const valor = primerValor(parametros, 'formato');
  return valor === 'csv' || valor === 'pdf' ? valor : null;
}
