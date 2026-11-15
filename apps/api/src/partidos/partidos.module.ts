import { Module } from '@nestjs/common';
import { CarteleraController } from './cartelera.controller.js';
import { MercadosService } from './mercados.service.js';
import { OperadorController } from './operador.controller.js';
import { PartidosService } from './partidos.service.js';

/** HU1: partidos, mercados, cuotas y cartelera. PartidosService.aplicarActualizacion lo usa la sincronización. */
@Module({
  controllers: [CarteleraController, OperadorController],
  providers: [PartidosService, MercadosService],
  exports: [PartidosService, MercadosService],
})
export class PartidosModule {}
