import type { EstadoDependencia, RespuestaSalud } from '@apuestas/shared';

/** Tiempo máximo por servicio; la API y reportes ya cortan sus propias dependencias a los 2 s. */
const TIMEOUT_MS = 3_000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpcionesConsulta {
  readonly fetcher?: Fetcher;
  readonly timeoutMs?: number;
}

export interface EntornoServicios {
  readonly API_URL?: string;
  readonly REPORTS_URL?: string;
}

export interface EstadoSistema {
  readonly api: RespuestaSalud | null;
  readonly reportes: RespuestaSalud | null;
}

export type Situacion = 'operativo' | 'caido' | 'sin-respuesta';

export interface DependenciaResumida {
  readonly clave: string;
  readonly nombre: string;
  readonly ok: boolean;
  readonly latenciaMs: number;
}

export interface ResumenServicio {
  readonly situacion: Situacion;
  readonly version: string | null;
  readonly dependencias: readonly DependenciaResumida[];
}

const NOMBRES_DEPENDENCIA: Readonly<Record<string, string>> = {
  baseDeDatos: 'Base de datos',
  cache: 'Caché',
};

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function esEstadoDependencia(valor: unknown): valor is EstadoDependencia {
  return (
    esObjeto(valor) &&
    (valor.estado === 'ok' || valor.estado === 'error') &&
    typeof valor.latenciaMs === 'number'
  );
}

/** La respuesta viene de otro servicio: se valida antes de usarla (no se confía en datos externos). */
function esRespuestaSalud(valor: unknown): valor is RespuestaSalud {
  return (
    esObjeto(valor) &&
    (valor.estado === 'ok' || valor.estado === 'error') &&
    (valor.servicio === 'api' || valor.servicio === 'reports') &&
    typeof valor.version === 'string' &&
    typeof valor.fecha === 'string' &&
    esObjeto(valor.dependencias) &&
    Object.values(valor.dependencias).every(esEstadoDependencia)
  );
}

/**
 * Consulta GET /health de un servicio desde el servidor de Next.js. Devuelve el cuerpo del contrato
 * también con 503 (el servicio responde pero una dependencia falla) y `null` si no hay respuesta válida.
 */
export async function consultarSalud(
  urlBase: string,
  { fetcher = fetch, timeoutMs = TIMEOUT_MS }: OpcionesConsulta = {},
): Promise<RespuestaSalud | null> {
  const url = `${urlBase.replace(/\/+$/, '')}/health`;
  try {
    const respuesta = await fetcher(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const cuerpo: unknown = await respuesta.json();
    return esRespuestaSalud(cuerpo) ? cuerpo : null;
  } catch {
    return null;
  }
}

export async function obtenerEstadoSistema(
  entorno: EntornoServicios,
  opciones: OpcionesConsulta = {},
): Promise<EstadoSistema> {
  const [api, reportes] = await Promise.all([
    consultarSalud(entorno.API_URL ?? 'http://localhost:3001', opciones),
    consultarSalud(entorno.REPORTS_URL ?? 'http://localhost:8000', opciones),
  ]);
  return { api, reportes };
}

export function resumirSalud(salud: RespuestaSalud | null): ResumenServicio {
  if (salud === null) {
    return { situacion: 'sin-respuesta', version: null, dependencias: [] };
  }
  return {
    situacion: salud.estado === 'ok' ? 'operativo' : 'caido',
    version: salud.version,
    dependencias: Object.entries(salud.dependencias).map(([clave, dependencia]) => ({
      clave,
      nombre: NOMBRES_DEPENDENCIA[clave] ?? clave,
      ok: dependencia.estado === 'ok',
      latenciaMs: dependencia.latenciaMs,
    })),
  };
}
