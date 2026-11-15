import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { COLAS } from '../colas/nombres.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
import { LiquidacionProcessor } from './liquidacion.processor.js';
import { LiquidacionService } from './liquidacion.service.js';

/** HU3: liquidación automática e idempotente, con aviso en tiempo real al dueño de la apuesta. */
@Module({
  imports: [TiempoRealModule, BullModule.registerQueue({ name: COLAS.liquidacion })],
  providers: [LiquidacionService, LiquidacionProcessor],
  exports: [LiquidacionService],
})
export class LiquidacionModule {}
