import 'server-only';
import type {
  CambioCupon,
  DetalleCupon,
  MisBonos,
  Paginado,
  SolicitudCrearCupon,
  SolicitudResolucionAlerta,
  VistaAlerta,
  VistaCupon,
} from '@apuestas/shared';
import type { FiltrosAlertas } from '@/lib/alertas/filtros';
import type { FiltrosCupones } from '@/lib/cupones/filtros';
import { construirConsulta } from '@/lib/parametros';
import type { Resultado } from '@/lib/resultado';
import type { ClienteApi } from './api';
import {
  esquemaDetalleCupon,
  esquemaMisBonos,
  esquemaPaginado,
  esquemaVistaAlerta,
  esquemaVistaCupon,
} from './esquemas-promociones';

/** Rutas de cupones, bonos y alertas de `apps/api` (contracts/api-rest.md). */

export const TAMANO_PAGINA = 20;

const esquemaListaCupones = esquemaPaginado(esquemaVistaCupon);
const esquemaListaAlertas = esquemaPaginado(esquemaVistaAlerta);

function rutaCupon(id: string): string {
  return `/api/cupones/${encodeURIComponent(id)}`;
}

function rutaAlerta(id: string): string {
  return `/api/alertas/${encodeURIComponent(id)}`;
}

export function listarCupones(
  api: ClienteApi,
  { estado, tipo, busqueda, pagina }: FiltrosCupones,
): Promise<Resultado<Paginado<VistaCupon>>> {
  const consulta = construirConsulta({ estado, tipo, busqueda, pagina, tamano: TAMANO_PAGINA });
  return api.obtener(`/api/cupones${consulta}`, esquemaListaCupones);
}

export function obtenerCupon(api: ClienteApi, id: string): Promise<Resultado<DetalleCupon>> {
  return api.obtener(rutaCupon(id), esquemaDetalleCupon);
}

export function crearCupon(
  api: ClienteApi,
  solicitud: SolicitudCrearCupon,
): Promise<Resultado<VistaCupon>> {
  return api.enviar('POST', '/api/cupones', solicitud, esquemaVistaCupon);
}

export function actualizarCupon(
  api: ClienteApi,
  id: string,
  cambio: CambioCupon,
): Promise<Resultado<VistaCupon>> {
  return api.enviar('PATCH', rutaCupon(id), cambio, esquemaVistaCupon);
}

export function obtenerMisBonos(api: ClienteApi): Promise<Resultado<MisBonos>> {
  return api.obtener('/api/bonos/mios', esquemaMisBonos);
}

export function listarAlertas(
  api: ClienteApi,
  { estado, severidad, regla, usuarioId, desde, hasta, pagina }: FiltrosAlertas,
): Promise<Resultado<Paginado<VistaAlerta>>> {
  const consulta = construirConsulta({
    estado,
    severidad,
    regla,
    usuarioId,
    // Los días de la URL son UTC e incluidos: desde el inicio del primero hasta el final del último.
    desde: desde && `${desde}T00:00:00.000Z`,
    hasta: hasta && `${hasta}T23:59:59.999Z`,
    pagina,
    tamano: TAMANO_PAGINA,
  });
  return api.obtener(`/api/alertas${consulta}`, esquemaListaAlertas);
}

export function obtenerAlerta(api: ClienteApi, id: string): Promise<Resultado<VistaAlerta>> {
  return api.obtener(rutaAlerta(id), esquemaVistaAlerta);
}

export function resolverAlerta(
  api: ClienteApi,
  id: string,
  solicitud: SolicitudResolucionAlerta,
): Promise<Resultado<VistaAlerta>> {
  return api.enviar('POST', `${rutaAlerta(id)}/resolucion`, solicitud, esquemaVistaAlerta);
}
