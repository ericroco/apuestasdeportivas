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

export interface TrabajoVencimiento {
  readonly partidoId: string;
  /** Momento de la suspensión o el aplazamiento que originó el plazo, en ISO. */
  readonly suspendidoEn: string;
}

const INTENTOS = 10;

export const TRABAJOS_LIQUIDACION = {
  liquidar: 'liquidar-partido',
  vencer: 'vencer-plazo',
  anular: 'anular-partido',
} as const;

const OPCIONES_REINTENTO = {
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: true,
  removeOnFail: 500,
};

/** Vencimiento del plazo de una suspensión o un aplazamiento (research.md §8): trabajo con retardo y persistente. */
export function encolarVencimiento(
  cola: Queue,
  trabajo: TrabajoVencimiento,
  retardoMs: number,
): Promise<unknown> {
  return cola.add(TRABAJOS_LIQUIDACION.vencer, trabajo, {
    jobId: `vencer-${trabajo.partidoId}-${new Date(trabajo.suspendidoEn).getTime()}`,
    delay: Math.max(0, retardoMs),
    attempts: INTENTOS,
    ...OPCIONES_REINTENTO,
  });
}

/** Anulación inmediata de un partido cancelado (FR-034). */
export function encolarAnulacion(cola: Queue, partidoId: string): Promise<unknown> {
  return cola.add(
    TRABAJOS_LIQUIDACION.anular,
    { partidoId },
    { jobId: `anular-${partidoId}`, attempts: INTENTOS, ...OPCIONES_REINTENTO },
  );
}

/** Encola la liquidación de un partido. El jobId descarta duplicados del mismo resultado (research.md §7). */
export function encolarLiquidacion(cola: Queue, trabajo: TrabajoLiquidacion): Promise<unknown> {
  return cola.add(TRABAJOS_LIQUIDACION.liquidar, trabajo, {
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

  async process(trabajo: Job): Promise<void> {
    const { partidoId } = trabajo.data as { partidoId: string };
    let resumen;
    switch (trabajo.name) {
      case TRABAJOS_LIQUIDACION.vencer:
        resumen = await this.liquidacion.vencerPlazo(
          partidoId,
          (trabajo.data as TrabajoVencimiento).suspendidoEn,
        );
        break;
      case TRABAJOS_LIQUIDACION.anular:
        resumen = await this.liquidacion.anularPartido(partidoId);
        break;
      default:
        resumen = await this.liquidacion.liquidarPartido(
          partidoId,
          (trabajo.data as TrabajoLiquidacion).versionResultado,
        );
    }
    this.logger.log(
      `${trabajo.name} ${partidoId}: ${resumen.liquidadas} liquidadas, ${resumen.pendientes} pendientes`,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    const pendientes = await this.prisma.$queryRaw<
      Array<{ id: string; version: number; estado: string }>
    >`
      SELECT DISTINCT p.id::text AS id, p.version_resultado AS version, p.estado::text AS estado
      FROM partido p
      JOIN seleccion_apostada sa ON sa.partido_id = p.id
      JOIN apuesta a ON a.id = sa.apuesta_id
      WHERE p.estado IN ('FINALIZADO', 'CANCELADO') AND a.estado = 'PENDIENTE'`;
    for (const { id, version, estado } of pendientes) {
      if (estado === 'CANCELADO') await encolarAnulacion(this.cola, id);
      else await encolarLiquidacion(this.cola, { partidoId: id, versionResultado: version });
    }
  }
}
