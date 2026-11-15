import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ColasModule } from './colas/colas.module.js';
import { ConfiguracionModule } from './config/configuracion.module.js';
import { ENTORNO, type Entorno } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { Spec2PendienteModule } from './integracion/spec2-pendiente.module.js';
import { PartidosModule } from './partidos/partidos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SincronizacionModule } from './sincronizacion/sincronizacion.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfiguracionModule,
    ThrottlerModule.forRootAsync({
      inject: [ENTORNO],
      useFactory: (entorno: Entorno) => [
        { ttl: entorno.THROTTLE_TTL_MS, limit: entorno.THROTTLE_LIMIT },
      ],
    }),
    PrismaModule,
    RedisModule,
    // Eventos de dominio entre specs (contrato 5) dentro del proceso.
    EventEmitterModule.forRoot(),
    ColasModule,
    // Temporal: billetera y auditoría de reemplazo hasta que el Spec 2 esté en develop.
    Spec2PendienteModule,
    HealthModule,
    PartidosModule,
    SincronizacionModule,
  ],
  // Rate limiting global (constitución, principio I). El guard de autenticación global
  // (denegación por defecto) lo registra el Spec 2 aquí mismo con APP_GUARD.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
