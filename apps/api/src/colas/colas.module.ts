import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ENTORNO, type Entorno } from '../config/env.js';

/**
 * Conexión de BullMQ. Abre sus propias conexiones con REDIS_URL y `maxRetriesPerRequest: null`, como exige
 * BullMQ; no reutiliza el cliente REDIS compartido (ver redis.constants.ts).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENTORNO],
      useFactory: (entorno: Entorno) => ({
        connection: { url: entorno.REDIS_URL, maxRetriesPerRequest: null },
      }),
    }),
  ],
})
export class ColasModule {}
