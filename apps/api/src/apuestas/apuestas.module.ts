import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { COLAS } from '../colas/nombres.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
import { AceptacionService } from './aceptacion.service.js';
import { ApuestasController } from './apuestas.controller.js';
import { ApuestasService } from './apuestas.service.js';
import { VivoProcessor } from './vivo.processor.js';

/** HU2, HU4 y HU7: aceptación atómica de apuestas simples, combinadas y en vivo, y "Mis apuestas". */
@Module({
  imports: [TiempoRealModule, BullModule.registerQueue({ name: COLAS.apuestasVivo })],
  controllers: [ApuestasController],
  providers: [AceptacionService, ApuestasService, VivoProcessor],
})
export class ApuestasModule {}
