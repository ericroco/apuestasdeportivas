import 'server-only';
import { cookies } from 'next/headers';
import { crearClienteApi, type ClienteApi } from './api';

/**
 * Cookie httpOnly que deja el login del Spec 2 (docs/equipo/contratos.md §6). Se lee solo en el servidor
 * (Server Components, Server Actions y route handlers); el navegador nunca la ve desde JavaScript.
 */
export const COOKIE_ACCESO = 'acceso';

const API_URL_LOCAL = 'http://localhost:3001';
const REPORTS_URL_LOCAL = 'http://localhost:8000';

export async function leerTokenAcceso(): Promise<string | null> {
  return (await cookies()).get(COOKIE_ACCESO)?.value ?? null;
}

export function urlApi(): string {
  return process.env.API_URL ?? API_URL_LOCAL;
}

export function urlReportes(): string {
  return process.env.REPORTS_URL ?? REPORTS_URL_LOCAL;
}

/** Cliente de la API con el token de la petición en curso. */
export async function clienteApiDeLaSesion(): Promise<ClienteApi> {
  return crearClienteApi({ urlBase: urlApi(), token: await leerTokenAcceso() });
}
