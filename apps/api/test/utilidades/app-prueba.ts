import { readFileSync } from 'node:fs';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { COLAS } from '../../src/colas/nombres.js';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { ENTORNO, type Entorno } from '../../src/config/env.js';
import { configurarApp } from '../../src/configurar-app.js';
import { AUDITORIA_PORT, BILLETERA_PORT } from '../../src/contracts/index.js';
import { AutenticacionGuard } from '../../src/identidad/autenticacion.guard.js';
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
  // El guard real del Spec 2 se reemplaza por el de prueba, que fija el usuario desde una cabecera y aplica el
  // mismo contrato (401 sin usuario, @Publico, @Roles). Las pruebas del Spec 2 usan el guard real.
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AutenticacionGuard)
    .useClass(GuardPrueba)
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
  const colas = [COLAS.liquidacion, COLAS.apuestasVivo].map((nombre) =>
    app.get<Queue>(getQueueToken(nombre)),
  );

  return {
    app,
    prisma,
    billetera,
    auditoria,
    async limpiar() {
      // Un trabajo de la prueba anterior (liquidación, apuesta en vivo) puede seguir corriendo: TRUNCATE necesita
      // un bloqueo exclusivo y chocaría con él. Se espera a que las colas estén quietas y se reintenta si aun así
      // PostgreSQL detecta un interbloqueo.
      await esperarColasQuietas(colas);
      for (let intento = 1; ; intento += 1) {
        try {
          // TRUNCATE no dispara los disparadores de inmutabilidad (son por fila).
          await prisma.$executeRawUnsafe(`TRUNCATE ${TABLAS_A_VACIAR.join(', ')} CASCADE`);
          break;
        } catch (error) {
          if (intento >= INTENTOS_LIMPIEZA) throw error;
          await esperarColasQuietas(colas);
        }
      }
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

const INTENTOS_LIMPIEZA = 5;
const ESPERA_COLAS_MS = 10_000;

/** Espera (con tope) a que no haya trabajos activos ni en espera inmediata en las colas del Spec 3. */
async function esperarColasQuietas(colas: readonly Queue[]): Promise<void> {
  const limite = Date.now() + ESPERA_COLAS_MS;
  while (Date.now() < limite) {
    const conteos = await Promise.all(colas.map((cola) => cola.getJobCounts('active', 'waiting')));
    if (conteos.every((c) => (c['active'] ?? 0) === 0 && (c['waiting'] ?? 0) === 0)) return;
    await new Promise((listo) => setTimeout(listo, 50));
  }
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
