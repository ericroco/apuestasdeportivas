import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { SolicitudApi } from './cliente-http.js';

/**
 * Rate limiting por la IP real del cliente (FR-011). Detrás del proxy de la web todas las peticiones llegan desde
 * Vercel; sin esto, todos los usuarios compartirían un mismo límite (research §1).
 */
@Injectable()
export class ThrottlerPorCliente extends ThrottlerGuard {
  protected override getTracker(solicitud: Record<string, unknown>): Promise<string> {
    const { cliente, ip } = solicitud as unknown as SolicitudApi;
    return Promise.resolve(cliente?.ip ?? ip ?? 'desconocida');
  }
}
