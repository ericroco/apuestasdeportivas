import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { ENTORNO, type Entorno } from '../../src/config/env.js';
import { configurarApp } from '../../src/configurar-app.js';
import { AUDITORIA_PORT, BILLETERA_PORT } from '../../src/contracts/index.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { REDIS } from '../../src/redis/redis.constants.js';
import type { Redis } from 'ioredis';
import { AuditoriaEnMemoria } from '../dobles/auditoria-memoria.double.js';
import { BilleteraSqlDePrueba } from '../dobles/billetera-sql.double.js';
import { GuardPrueba } from '../dobles/guard-prueba.js';

/** Tablas del Spec 3 y de la billetera de prueba que se vacían entre pruebas. */
const TABLAS_A_VACIAR = [
  'liquidacion',
  'solicitud_apuesta_vivo',
  'seleccion_apostada',
  'apuesta',
  'historial_cuota',
  'seleccion',
  'mercado',
  'partido',
  'competicion',
  'consumo_proveedor',
  'pruebas.asiento',
  'pruebas.billetera',
];

export interface AppPrueba {
  readonly app: NestExpressApplication;
  readonly prisma: PrismaService;
  readonly billetera: BilleteraSqlDePrueba;
  readonly auditoria: AuditoriaEnMemoria;
  /** Vacía las tablas del Spec 3, la billetera de prueba y la auditoría capturada. */
  limpiar(): Promise<void>;
}

/**
 * AppModule completo contra PostgreSQL y Redis reales, con los dobles de los contratos del Spec 2
 * (research.md §12): billetera SQL que participa en la transacción, auditoría en memoria y guard de prueba.
 */
export async function crearAppPrueba(): Promise<AppPrueba> {
  const auditoria = new AuditoriaEnMemoria();
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
    providers: [{ provide: APP_GUARD, useClass: GuardPrueba }],
  })
    .overrideProvider(BILLETERA_PORT)
    .useFactory({
      factory: (prisma: PrismaService) => new BilleteraSqlDePrueba(prisma),
      inject: [PrismaService],
    })
    .overrideProvider(AUDITORIA_PORT)
    .useValue(auditoria)
    .compile();

  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app, app.get<Entorno>(ENTORNO));
  await app.init();

  const prisma = app.get(PrismaService);
  await crearEsquemaPruebas(prisma);
  const billetera = app.get<BilleteraSqlDePrueba>(BILLETERA_PORT);
  const redis = app.get<Redis>(REDIS);

  return {
    app,
    prisma,
    billetera,
    auditoria,
    async limpiar() {
      // TRUNCATE no dispara los disparadores de inmutabilidad (son por fila).
      await prisma.$executeRawUnsafe(`TRUNCATE ${TABLAS_A_VACIAR.join(', ')} CASCADE`);
      auditoria.limpiar();
      // Contadores de presupuesto, temporadas y tickets del Spec 3 (solo claves de prueba locales).
      const claves = [
        ...(await redis.keys('api-football:*')),
        ...(await redis.keys('ws:ticket:*')),
      ];
      if (claves.length) await redis.del(...claves);
    },
  };
}

/** Ejecuta esquema-pruebas.sql sentencia por sentencia (el driver no acepta varias en una llamada). */
async function crearEsquemaPruebas(prisma: PrismaService): Promise<void> {
  const sql = readFileSync(join(import.meta.dirname, '../dobles/esquema-pruebas.sql'), 'utf8');
  const sentencias = sql
    .split('\n')
    .filter((linea) => !linea.trimStart().startsWith('--'))
    .join('\n')
    .split(/;\s*$/m)
    .map((sentencia) => sentencia.trim())
    .filter(Boolean);
  for (const sentencia of sentencias) {
    await prisma.$executeRawUnsafe(sentencia);
  }
}
