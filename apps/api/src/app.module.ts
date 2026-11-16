import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApuestasModule } from './apuestas/apuestas.module.js';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { BilleteraModule } from './billetera/billetera.module.js';
import { ColasModule } from './colas/colas.module.js';
import { ConfiguracionModule } from './config/configuracion.module.js';
import { ENTORNO, type Entorno } from './config/env.js';
import { FraudeModule } from './fraude/fraude.module.js';
import { HealthModule } from './health/health.module.js';
import { AutenticacionGuard } from './identidad/autenticacion.guard.js';
import { ThrottlerPorCliente } from './identidad/http/throttler-por-cliente.guard.js';
import { IdentidadModule } from './identidad/identidad.module.js';
import { LiquidacionModule } from './liquidacion/liquidacion.module.js';
import { PagosModule } from './pagos/pagos.module.js';
import { PartidosModule } from './partidos/partidos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PromocionesModule } from './promociones/promociones.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RetirosModule } from './retiros/retiros.module.js';
import { SincronizacionModule } from './sincronizacion/sincronizacion.module.js';

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
    RetirosModule,
    HealthModule,
    FraudeModule,
    PromocionesModule,
    // Spec 3: colas BullMQ, partidos y mercados, importación del proveedor y apuestas.
    ColasModule,
    PartidosModule,
    SincronizacionModule,
    ApuestasModule,
    LiquidacionModule,
  ],
  // Los guards globales corren en este orden (constitución, principio I):
  // 1) rate limiting por la IP real del cliente; 2) autenticación y roles con denegación por defecto (contrato 1).
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerPorCliente },
    { provide: APP_GUARD, useExisting: AutenticacionGuard },
  ],
})
export class AppModule {}
