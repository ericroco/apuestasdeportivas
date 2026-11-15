import 'server-only';
import { z, type ZodType } from 'zod';
import type { Resultado } from '@/lib/resultado';
import {
  interpretar,
  normalizarToken,
  pedir,
  unirUrl,
  type ErrorDeServicio,
  type OpcionesHttp,
} from './http';

/**
 * Cliente de `apps/api` desde el servidor de Next.js (FR-033). Reenvía la cookie httpOnly `acceso` como
 * cabecera `Cookie`: el token nunca pasa por el JavaScript del navegador.
 */

export interface OpcionesClienteApi extends OpcionesHttp {
  readonly urlBase: string;
  readonly token: string | null | undefined;
}

export type MetodoEscritura = 'POST' | 'PATCH';

export interface ClienteApi {
  obtener<T>(ruta: string, esquema: ZodType<T>): Promise<Resultado<T>>;
  enviar<T>(
    metodo: MetodoEscritura,
    ruta: string,
    cuerpo: unknown,
    esquema: ZodType<T>,
  ): Promise<Resultado<T>>;
}

/** Formato de error del Spec 1: `{ statusCode, error, codigo, message }`. */
const esquemaErrorApi = z.object({
  codigo: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]).optional(),
});

function leerErrorApi(cuerpo: unknown): ErrorDeServicio {
  const error = esquemaErrorApi.safeParse(cuerpo);
  if (!error.success) return {};
  const { codigo, message } = error.data;
  return { codigo, mensaje: Array.isArray(message) ? message.join('. ') : message };
}

export function crearClienteApi({ urlBase, token, ...opciones }: OpcionesClienteApi): ClienteApi {
  const acceso = normalizarToken(token);

  async function solicitar<T>(
    ruta: string,
    init: RequestInit,
    esquema: ZodType<T>,
  ): Promise<Resultado<T>> {
    if (acceso === null) return { tipo: 'sin-sesion' };
    const cabeceras = { accept: 'application/json', cookie: `acceso=${acceso}` };
    const respuesta = await pedir(
      unirUrl(urlBase, ruta),
      { ...init, headers: { ...cabeceras, ...init.headers } },
      opciones,
    );
    return interpretar(respuesta, esquema, leerErrorApi);
  }

  return {
    obtener: (ruta, esquema) => solicitar(ruta, { method: 'GET' }, esquema),
    enviar: (metodo, ruta, cuerpo, esquema) =>
      solicitar(
        ruta,
        {
          method: metodo,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cuerpo),
        },
        esquema,
      ),
  };
}
