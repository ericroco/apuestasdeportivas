import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { UsuarioAutenticado } from '../../contracts/autenticacion.js';
import type { Alcance } from '../tokens.service.js';

/** IP y dispositivo reales del cliente, para la auditoría y el rate limiting (research §1). */
export interface ClienteHttp {
  readonly ip: string;
  readonly dispositivo: string;
}

/** Petición después del middleware de cliente y del guard de autenticación. */
export interface SolicitudApi extends Request {
  cliente: ClienteHttp;
  user?: UsuarioAutenticado;
  sesion?: { readonly id: string; readonly alcance: Alcance };
}

export const CABECERA_SECRETO_PROXY = 'x-proxy-secreto';
export const CABECERA_IP_CLIENTE = 'x-cliente-ip';
export const CABECERA_DISPOSITIVO_CLIENTE = 'x-cliente-dispositivo';
const LARGO_MAXIMO_DISPOSITIVO = 300;

function iguales(a: string, b: string): boolean {
  // Se comparan los hashes para que la comparación sea de tiempo constante aunque los largos difieran.
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

/**
 * Solo el proxy de la web (que conoce `WEB_PROXY_SECRETO`) puede informar la IP del navegador. Cualquier otro que
 * mande esas cabeceras se ignora y se usa la IP que ve Express (con `TRUST_PROXY_HOPS`).
 */
export function resolverCliente(solicitud: Request, secretoProxy: string): ClienteHttp {
  const secreto = solicitud.header(CABECERA_SECRETO_PROXY);
  const ipProxy = solicitud.header(CABECERA_IP_CLIENTE)?.trim();
  if (secreto && iguales(secreto, secretoProxy) && ipProxy && isIP(ipProxy)) {
    return {
      ip: ipProxy,
      dispositivo: (solicitud.header(CABECERA_DISPOSITIVO_CLIENTE) ?? '').slice(
        0,
        LARGO_MAXIMO_DISPOSITIVO,
      ),
    };
  }
  return {
    ip: solicitud.ip ?? solicitud.socket.remoteAddress ?? 'desconocida',
    dispositivo: (solicitud.header('user-agent') ?? '').slice(0, LARGO_MAXIMO_DISPOSITIVO),
  };
}

export function middlewareCliente(secretoProxy: string) {
  return (solicitud: Request, _respuesta: Response, siguiente: NextFunction): void => {
    (solicitud as SolicitudApi).cliente = resolverCliente(solicitud, secretoProxy);
    siguiente();
  };
}

/** Inyecta la IP y el dispositivo del cliente en un controlador. */
export const ClienteActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): ClienteHttp =>
    contexto.switchToHttp().getRequest<SolicitudApi>().cliente,
);
