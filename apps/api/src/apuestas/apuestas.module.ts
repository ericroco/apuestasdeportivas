import { Module } from '@nestjs/common';
import { AceptacionService } from './aceptacion.service.js';
import { ApuestasController } from './apuestas.controller.js';
import { ApuestasService } from './apuestas.service.js';

/** HU2 y HU4: aceptación atómica de apuestas simples y combinadas, y "Mis apuestas". */
@Module({
  controllers: [ApuestasController],
  providers: [AceptacionService, ApuestasService],
})
export class ApuestasModule {}
