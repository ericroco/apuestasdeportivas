import type { CookieOptions, Response } from 'express';
import type { Entorno } from '../config/env.js';
import { COOKIE_ACCESO } from './autenticacion.guard.js';

/** Cookies de sesión (contracts/api-rest.md). La renovación y el desafío solo viajan a las rutas de sesión. */
export const COOKIE_RENOVACION = 'renovacion';
export const COOKIE_DESAFIO = 'desafio';
export const RUTA_SESION = '/api/identidad/sesion';
const VIDA_DESAFIO_MS = 5 * 60 * 1000;

function base(entorno: Entorno): CookieOptions {
  return { httpOnly: true, secure: entorno.COOKIE_SECURE, sameSite: 'lax' };
}

export function ponerCookiesSesion(
  respuesta: Response,
  entorno: Entorno,
  tokens: { acceso: string; renovacion: string },
): void {
  respuesta.cookie(COOKIE_ACCESO, tokens.acceso, {
    ...base(entorno),
    path: '/',
    maxAge: entorno.JWT_ACCESS_TTL * 1000,
  });
  respuesta.cookie(COOKIE_RENOVACION, tokens.renovacion, {
    ...base(entorno),
    path: RUTA_SESION,
    maxAge: entorno.JWT_REFRESH_TTL * 1000,
  });
  respuesta.clearCookie(COOKIE_DESAFIO, { ...base(entorno), path: RUTA_SESION });
}

export function ponerCookieDesafio(respuesta: Response, entorno: Entorno, desafio: string): void {
  respuesta.cookie(COOKIE_DESAFIO, desafio, {
    ...base(entorno),
    path: RUTA_SESION,
    maxAge: VIDA_DESAFIO_MS,
  });
}

export function borrarCookiesSesion(respuesta: Response, entorno: Entorno): void {
  respuesta.clearCookie(COOKIE_ACCESO, { ...base(entorno), path: '/' });
  respuesta.clearCookie(COOKIE_RENOVACION, { ...base(entorno), path: RUTA_SESION });
  respuesta.clearCookie(COOKIE_DESAFIO, { ...base(entorno), path: RUTA_SESION });
}
