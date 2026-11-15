import { hoyUtc } from '@/lib/reportes/filtros';
import { responderExportacion } from '@/lib/servidor/exportacion';
import { clienteReportesDeLaSesion } from '@/lib/servidor/sesion';

/**
 * `GET /admin/reportes/exportar?formato=csv|pdf&desde=…`: descarga el reporte con los filtros de la URL.
 * Pide el archivo a reportes desde el servidor con el token de la cookie `acceso` (FR-033) y lo transmite.
 */
export async function GET(request: Request): Promise<Response> {
  const cliente = await clienteReportesDeLaSesion();
  return responderExportacion(new URL(request.url), cliente, hoyUtc());
}
