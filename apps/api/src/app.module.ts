import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { BilleteraModule } from './billetera/billetera.module.js';
import { ConfiguracionModule } from './config/configuracion.module.js';
import { ENTORNO, type Entorno } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { AutenticacionGuard } from './identidad/autenticacion.guard.js';
import { ThrottlerPorCliente } from './identidad/http/throttler-por-cliente.guard.js';
import { IdentidadModule } from './identidad/identidad.module.js';
import { PagosModule } from './pagos/pagos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
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
    // Eventos de dominio entre specs (contrato 5) y tareas programadas (caducidad de depósitos).
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuditoriaModule,
    BilleteraModule,
    IdentidadModule,
    PagosModule,
    HealthModule,
  ],
  // Los guards globales corren en este orden (constitución, principio I):
  // 1) rate limiting por la IP real del cliente; 2) autenticación y roles con denegación por defecto (contrato 1).
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerPorCliente },
    { provide: APP_GUARD, useExisting: AutenticacionGuard },
  ],
})
export class AppModule {}
