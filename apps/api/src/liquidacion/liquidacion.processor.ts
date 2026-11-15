import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { COLAS } from '../colas/nombres.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LiquidacionService } from './liquidacion.service.js';

export interface TrabajoLiquidacion {
  readonly partidoId: string;
  readonly versionResultado: number;
}

const INTENTOS = 10;

/** Encola la liquidación de un partido. El jobId descarta duplicados del mismo resultado (research.md §7). */
export function encolarLiquidacion(cola: Queue, trabajo: TrabajoLiquidacion): Promise<unknown> {
  return cola.add('liquidar-partido', trabajo, {
    // BullMQ no admite ':' en los ids propios: se usan guiones.
    jobId: `liquidar-${trabajo.partidoId}-v${trabajo.versionResultado}`,
    attempts: INTENTOS,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: true,
    removeOnFail: 500,
  });
}

/**
 * Consume la cola `liquidacion` (persistente en Redis): una caída no pierde resultados y la liquidación pendiente
 * se completa al recuperarse (FR-028). Al arrancar vuelve a encolar los partidos finalizados que tengan apuestas
 * pendientes, por si el proceso cayó entre el commit del resultado y el encolado.
 */
@Processor(COLAS.liquidacion, { concurrency: 1 })
export class LiquidacionProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger('LiquidacionProcessor');

  constructor(
    private readonly liquidacion: LiquidacionService,
    private readonly prisma: PrismaService,
    @InjectQueue(COLAS.liquidacion) private readonly cola: Queue,
  ) {
    super();
  }

  async process(trabajo: Job<TrabajoLiquidacion>): Promise<void> {
    const { partidoId, versionResultado } = trabajo.data;
    const resumen = await this.liquidacion.liquidarPartido(partidoId, versionResultado);
    this.logger.log(
      `Partido ${partidoId} v${versionResultado}: ${resumen.liquidadas} liquidadas, ${resumen.pendientes} pendientes`,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    const pendientes = await this.prisma.$queryRaw<Array<{ id: string; version: number }>>`
      SELECT DISTINCT p.id::text AS id, p.version_resultado AS version
      FROM partido p
      JOIN seleccion_apostada sa ON sa.partido_id = p.id
      JOIN apuesta a ON a.id = sa.apuesta_id
      WHERE p.estado = 'FINALIZADO' AND a.estado = 'PENDIENTE'`;
    for (const { id, version } of pendientes) {
      await encolarLiquidacion(this.cola, { partidoId: id, versionResultado: version });
    }
  }
}
