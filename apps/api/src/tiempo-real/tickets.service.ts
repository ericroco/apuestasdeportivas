import { randomBytes } from 'node:crypto';
import type { TicketTiempoRealDto } from '@apuestas/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.constants.js';

const VIGENCIA_SEGUNDOS = 60;
const BYTES_TICKET = 32;
/** base64url de 32 bytes = 43 caracteres; cualquier cosa más larga ni se consulta. */
const LARGO_MAXIMO = 64;

/**
 * Tickets de conexión al WebSocket (contracts/tiempo-real.md, research.md §9): aleatorios, de un solo uso y
 * válidos 60 s. Desacoplan el WebSocket de la cookie de sesión, que no viaja entre Vercel y Render.
 */
@Injectable()
export class TicketsService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async emitir(usuarioId: string): Promise<TicketTiempoRealDto> {
    const ticket = randomBytes(BYTES_TICKET).toString('base64url');
    await this.redis.set(clave(ticket), usuarioId, 'EX', VIGENCIA_SEGUNDOS);
    return { ticket, expiraEn: new Date(Date.now() + VIGENCIA_SEGUNDOS * 1000).toISOString() };
  }

  /** Devuelve el usuario y borra el ticket en la misma operación (GETDEL): no se puede reutilizar. */
  async consumir(ticket: unknown): Promise<string | null> {
    if (typeof ticket !== 'string' || ticket.length === 0 || ticket.length > LARGO_MAXIMO)
      return null;
    return this.redis.getdel(clave(ticket));
  }
}

function clave(ticket: string): string {
  return `ws:ticket:${ticket}`;
}
