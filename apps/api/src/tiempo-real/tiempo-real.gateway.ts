import { ESPACIO_TIEMPO_REAL, EVENTOS_TIEMPO_REAL } from '@apuestas/shared';
import { Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { Publico } from '../contracts/index.js';
import { TicketsService } from './tickets.service.js';

/** Máximo de partidos que sigue un mismo socket (contracts/tiempo-real.md). */
const MAX_PARTIDOS_POR_SOCKET = 20;
const PREFIJO_PARTIDO = 'partido:';

const seguirEsquema = z.object({ partidoId: z.uuid() }).strict();

export interface RespuestaSuscripcion {
  readonly ok: boolean;
  readonly motivo?: string;
}

export const salaUsuario = (usuarioId: string) => `usuario:${usuarioId}`;
export const salaPartido = (partidoId: string) => `${PREFIJO_PARTIDO}${partidoId}`;

/**
 * Gateway Socket.IO `/tiempo-real` (research.md §9). La autenticación es el ticket de un solo uso que se
 * valida en el handshake: sin ticket válido, `connect_error` TICKET_INVALIDO. Por eso las rutas del gateway
 * son `@Publico()` para el guard HTTP global. Cada socket entra a `usuario:<id>` en el handshake y solo ahí:
 * el cliente no puede unirse a la sala de otro usuario. CORS limitado a WEB_ORIGIN (AdaptadorSocketIo).
 */
@WebSocketGateway({ namespace: ESPACIO_TIEMPO_REAL })
@Publico()
@SkipThrottle()
export class TiempoRealGateway implements OnGatewayInit<Namespace> {
  private readonly logger = new Logger('TiempoReal');

  @WebSocketServer()
  servidor?: Namespace;

  constructor(private readonly tickets: TicketsService) {}

  afterInit(servidor: Namespace): void {
    servidor.use((socket, siguiente) => {
      this.tickets
        .consumir(socket.handshake.auth?.['ticket'])
        .then(async (usuarioId) => {
          if (!usuarioId) return siguiente(new Error('TICKET_INVALIDO'));
          socket.data['usuarioId'] = usuarioId;
          await socket.join(salaUsuario(usuarioId));
          return siguiente();
        })
        .catch((error: unknown) => {
          this.logger.error(`Fallo al validar un ticket: ${String(error)}`);
          siguiente(new Error('TICKET_INVALIDO'));
        });
    });
  }

  @SubscribeMessage(EVENTOS_TIEMPO_REAL.partidoSeguir)
  async seguir(
    @ConnectedSocket() socket: Socket,
    @MessageBody() cuerpo: unknown,
  ): Promise<RespuestaSuscripcion> {
    const lectura = seguirEsquema.safeParse(cuerpo);
    if (!lectura.success) return { ok: false, motivo: 'partidoId inválido' };
    const siguiendo = [...socket.rooms].filter((sala) => sala.startsWith(PREFIJO_PARTIDO));
    if (siguiendo.length >= MAX_PARTIDOS_POR_SOCKET) {
      return { ok: false, motivo: `máximo ${MAX_PARTIDOS_POR_SOCKET} partidos por conexión` };
    }
    await socket.join(salaPartido(lectura.data.partidoId));
    return { ok: true };
  }

  @SubscribeMessage(EVENTOS_TIEMPO_REAL.partidoDejar)
  async dejar(
    @ConnectedSocket() socket: Socket,
    @MessageBody() cuerpo: unknown,
  ): Promise<RespuestaSuscripcion> {
    const lectura = seguirEsquema.safeParse(cuerpo);
    if (!lectura.success) return { ok: false, motivo: 'partidoId inválido' };
    await socket.leave(salaPartido(lectura.data.partidoId));
    return { ok: true };
  }
}
