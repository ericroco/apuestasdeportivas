import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OrigenDato } from '@apuestas/shared';
import type { Request } from 'express';
import type { UsuarioAutenticado } from '../contracts/index.js';

/** Quién y desde dónde hace una acción sensible: va a la auditoría (FR-040). */
export interface ContextoAccion {
  /** `null` para procesos del sistema (proveedor, simulación, worker). */
  readonly actorId: string | null;
  readonly origen: OrigenDato;
  readonly ip?: string;
  readonly dispositivo?: string;
}

/** Contexto de un proceso del sistema (importación, simulación, vencimiento de plazos). */
export function contextoSistema(origen: Exclude<OrigenDato, 'OPERADOR'>): ContextoAccion {
  return { actorId: null, origen };
}

/** IP y dispositivo del cliente de la petición, para la auditoría de acciones del apostador. */
export interface DatosCliente {
  readonly ip?: string;
  readonly dispositivo?: string;
}

export const ClienteDeLaPeticion = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): DatosCliente => {
    const solicitud = contexto.switchToHttp().getRequest<Request>();
    const dispositivo = solicitud.get('user-agent');
    return {
      ...(solicitud.ip ? { ip: solicitud.ip } : {}),
      ...(dispositivo ? { dispositivo } : {}),
    };
  },
);

/** Inyecta el ContextoAccion del operador autenticado, con la IP y el dispositivo de la petición. */
export const ContextoOperador = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): ContextoAccion => {
    const solicitud = contexto.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    const dispositivo = solicitud.get('user-agent');
    return {
      actorId: solicitud.user?.id ?? null,
      origen: 'OPERADOR',
      ...(solicitud.ip ? { ip: solicitud.ip } : {}),
      ...(dispositivo ? { dispositivo } : {}),
    };
  },
);
