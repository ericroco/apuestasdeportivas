import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Adaptador de Socket.IO con CORS limitado al origen de la web (WEB_ORIGIN), que solo se conoce al arrancar
 * y por eso no puede ir en el decorador del gateway.
 */
export class AdaptadorSocketIo extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origenWeb: string,
  ) {
    super(app);
  }

  override createIOServer(puerto: number, opciones?: ServerOptions): Server {
    const conCors = {
      ...opciones,
      cors: { origin: [this.origenWeb], credentials: true },
    } as ServerOptions;
    return super.createIOServer(puerto, conCors) as Server;
  }
}
