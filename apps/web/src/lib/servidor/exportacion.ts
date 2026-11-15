import 'server-only';
import { leerFormato, type MotivoExportacion } from '@/lib/reportes/exportacion';
import { hrefReportes, leerFiltrosReporte, type FiltrosReporte } from '@/lib/reportes/filtros';
import type { ClienteReportes } from './reportes';

/**
 * Respuesta de `/admin/reportes/exportar`: transmite el CSV o el PDF de reportes sin cargarlo entero en
 * memoria. Si no se puede, vuelve al dashboard con los mismos filtros y el motivo, que la página explica.
 */
export async function responderExportacion(
  url: URL,
  cliente: ClienteReportes,
  hoy: string,
): Promise<Response> {
  const parametros = Object.fromEntries(url.searchParams);
  const formato = leerFormato(parametros);
  const lectura = leerFiltrosReporte(parametros, hoy);
  if (formato === null || !lectura.ok) return volverAlTablero(url, lectura.filtros, 'filtros');
  const resultado = await cliente.exportar(lectura.filtros, formato);
  if (resultado.tipo !== 'ok') return volverAlTablero(url, lectura.filtros, resultado.tipo);
  const { cuerpo, tipoContenido, nombreArchivo } = resultado.datos;
  return new Response(cuerpo, {
    status: 200,
    headers: {
      'content-type': tipoContenido,
      'content-disposition': `attachment; filename="${nombreArchivo}"`,
      // El reporte es del administrador que lo pidió: ningún intermediario lo guarda.
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function volverAlTablero(url: URL, filtros: FiltrosReporte, motivo: MotivoExportacion): Response {
  return Response.redirect(new URL(hrefReportes(filtros, { exportacion: motivo }), url), 303);
}
