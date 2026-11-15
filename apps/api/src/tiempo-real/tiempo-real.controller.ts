import type { TicketTiempoRealDto } from '@apuestas/shared';
import { Controller, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type UsuarioAutenticado, UsuarioActual } from '../contracts/index.js';
import { TicketsService } from './tickets.service.js';

/** Límite propio por cliente para frenar la emisión masiva de tickets (contracts/api-rest.md). */
const LIMITE_TICKETS = { default: { limit: 10, ttl: 60_000 } };

/** Cualquier usuario autenticado pide un ticket para conectarse al WebSocket. */
@Controller('tiempo-real')
export class TiempoRealController {
  constructor(private readonly tickets: TicketsService) {}

  @Post('ticket')
  @Throttle(LIMITE_TICKETS)
  emitir(@UsuarioActual() usuario: UsuarioAutenticado | undefined): Promise<TicketTiempoRealDto> {
    // El guard global del Spec 2 garantiza el usuario; si no está (guard ausente), no hay ticket.
    if (!usuario) throw new UnauthorizedException('Inicia sesión para continuar');
    return this.tickets.emitir(usuario.id);
  }
}
