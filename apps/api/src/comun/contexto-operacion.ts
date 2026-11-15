import type { OrigenDato } from '@apuestas/shared';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SolicitudApi } from '../identidad/http/cliente-http.js';

/**
 * Contexto de las operaciones del Spec 3 sobre partidos, mercados y apuestas, para la auditoría (FR-040).
 * A diferencia de `ContextoAccion` (Spec 4), lleva el origen del cambio: el operador, el proveedor deportivo o la
 * simulación. En estos dos últimos no hay usuario: `actorId` es `null`.
 */
export interface ContextoOperacion {
  readonly actorId: string | null;
  readonly origen: OrigenDato;
  readonly ip?: string;
  readonly dispositivo?: string;
}

/** IP y dispositivo del cliente de la petición, para la auditoría de acciones del apostador. */
export interface DatosCliente {
  readonly ip?: string;
  readonly dispositivo?: string;
}

/** Contexto de un proceso del sistema (importación, simulación, vencimiento de plazos). */
export function contextoSistema(origen: Exclude<OrigenDato, 'OPERADOR'>): ContextoOperacion {
  return { actorId: null, origen };
}

/**
 * IP y dispositivo reales: los resuelve el middleware del Spec 2 (`solicitud.cliente`), que confía en el proxy de
 * la web. Sin el middleware (pruebas unitarias), cae a lo que ve Express.
 */
function datosDe(
  solicitud: Partial<SolicitudApi> & { ip?: string; get?: (h: string) => string | undefined },
): DatosCliente {
  const ip = solicitud.cliente?.ip ?? solicitud.ip;
  const dispositivo = solicitud.cliente?.dispositivo ?? solicitud.get?.('user-agent');
  return { ...(ip ? { ip } : {}), ...(dispositivo ? { dispositivo } : {}) };
}

export const ClienteDeLaPeticion = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): DatosCliente =>
    datosDe(contexto.switchToHttp().getRequest<SolicitudApi>()),
);

/** Inyecta el ContextoOperacion del operador autenticado, con la IP y el dispositivo de la petición. */
export const ContextoOperador = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): ContextoOperacion => {
    const solicitud = contexto.switchToHttp().getRequest<SolicitudApi>();
    return { actorId: solicitud.user?.id ?? null, origen: 'OPERADOR', ...datosDe(solicitud) };
  },
);
