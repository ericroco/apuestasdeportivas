import 'server-only';
import type { ZodType } from 'zod';
import type { FalloConsulta, Resultado } from '@/lib/resultado';

/** Piezas comunes de los clientes de la API y de reportes. Solo corren en el servidor de Next.js. */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpcionesHttp {
  readonly fetcher?: Fetcher;
  readonly timeoutMs?: number;
}

/** Tiempo máximo de una consulta; una pantalla prefiere decir "no disponible" a quedarse colgada. */
export const TIMEOUT_MS = 5_000;

const LARGO_MAXIMO_TOKEN = 8_192;
/** Caracteres de un JWT (base64url y puntos). Excluye `;`, espacios y saltos de línea. */
const FORMATO_TOKEN = /^[\w.~+/=-]+$/;

const MENSAJE_GENERICO = 'El servicio rechazó la solicitud.';

/**
 * El token viene de una cookie del navegador: solo se reenvía si tiene forma de JWT, para que no pueda
 * inyectar otra cookie u otra cabecera en la llamada servidor a servidor.
 */
export function normalizarToken(token: string | null | undefined): string | null {
  if (!token || token.length > LARGO_MAXIMO_TOKEN || !FORMATO_TOKEN.test(token)) {
    return null;
  }
  return token;
}

export function unirUrl(urlBase: string, ruta: string): string {
  return `${urlBase.replace(/\/+$/, '')}${ruta}`;
}

/** Hace la petición sin caché. Devuelve `null` si no hubo respuesta (red caída o tiempo agotado). */
export async function pedir(
  url: string,
  init: RequestInit,
  { fetcher = fetch, timeoutMs = TIMEOUT_MS }: OpcionesHttp = {},
): Promise<Response | null> {
  try {
    return await fetcher(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
}

export interface ErrorDeServicio {
  readonly codigo?: string;
  readonly mensaje?: string;
}

/** Extrae `codigo` y `mensaje` del cuerpo de error propio de cada servicio. */
export type LectorError = (cuerpo: unknown) => ErrorDeServicio;

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return undefined;
  }
}

export function falloPorEstado(estado: number, error: ErrorDeServicio): FalloConsulta {
  if (estado === 401) return { tipo: 'sin-sesion' };
  if (estado === 403) return { tipo: 'sin-permiso' };
  if (estado >= 500) {
    return error.codigo
      ? { tipo: 'no-disponible', codigo: error.codigo }
      : { tipo: 'no-disponible' };
  }
  return {
    tipo: 'rechazo',
    estado,
    codigo: error.codigo ?? (estado === 404 ? 'NO_ENCONTRADO' : `HTTP_${estado}`),
    mensaje: error.mensaje ?? MENSAJE_GENERICO,
  };
}

/** Fallo de una respuesta que no es 2xx, con el `codigo` y el mensaje de su cuerpo de error. */
export async function falloDeRespuesta(
  respuesta: Response,
  leerError: LectorError,
): Promise<FalloConsulta> {
  return falloPorEstado(respuesta.status, leerError(await leerJson(respuesta)));
}

/**
 * Convierte la respuesta en un `Resultado`. La respuesta viene de otro servicio: se valida con su
 * esquema y, si no cumple el contrato, se trata como "no disponible" (nunca se muestran datos dudosos).
 */
export async function interpretar<T>(
  respuesta: Response | null,
  esquema: ZodType<T>,
  leerError: LectorError,
): Promise<Resultado<T>> {
  if (respuesta === null) return { tipo: 'no-disponible' };
  if (!respuesta.ok) return falloDeRespuesta(respuesta, leerError);
  const validado = esquema.safeParse(await leerJson(respuesta));
  return validado.success ? { tipo: 'ok', datos: validado.data } : { tipo: 'no-disponible' };
}
