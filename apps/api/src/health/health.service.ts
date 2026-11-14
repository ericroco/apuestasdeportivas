import { readFileSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import type { EstadoDependencia, RespuestaSalud } from '@apuestas/shared';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.constants.js';

/** Presupuesto por dependencia; las dos se comprueban en paralelo (SC-005: ≤ 5 s). */
export const TIMEOUT_DEPENDENCIA_MS = 2_000;

// src/health y dist/health están a la misma profundidad respecto de package.json.
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

async function medir(comprobacion: () => Promise<unknown>): Promise<EstadoDependencia> {
  const inicio = performance.now();
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('timeout')), TIMEOUT_DEPENDENCIA_MS);
  });
  try {
    await Promise.race([comprobacion(), limite]);
    return { estado: 'ok', latenciaMs: Math.round(performance.now() - inicio) };
  } catch {
    // El detalle del error no se expone (FR-005); la dependencia simplemente queda en "error".
    return {
      estado: 'error',
      latenciaMs: Math.min(Math.round(performance.now() - inicio), TIMEOUT_DEPENDENCIA_MS),
    };
  } finally {
    clearTimeout(temporizador);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async comprobar(): Promise<RespuestaSalud> {
    const [baseDeDatos, cache] = await Promise.all([
      medir(() => this.prisma.$queryRaw`SELECT 1`),
      medir(() => this.redis.ping()),
    ]);
    const todasOk = baseDeDatos.estado === 'ok' && cache.estado === 'ok';
    return {
      estado: todasOk ? 'ok' : 'error',
      servicio: 'api',
      version: VERSION,
      fecha: new Date().toISOString(),
      dependencias: { baseDeDatos, cache },
    };
  }
}
