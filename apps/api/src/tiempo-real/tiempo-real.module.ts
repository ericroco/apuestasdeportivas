import { Module } from '@nestjs/common';
import { NotificadorService } from './notificador.service.js';
import { TicketsService } from './tickets.service.js';
import { TiempoRealController } from './tiempo-real.controller.js';
import { TiempoRealGateway } from './tiempo-real.gateway.js';

/** Tiempo real: ticket de conexión, gateway Socket.IO y emisión tras el commit. */
@Module({
  controllers: [TiempoRealController],
  providers: [TicketsService, TiempoRealGateway, NotificadorService],
  exports: [NotificadorService],
})
export class TiempoRealModule {}
