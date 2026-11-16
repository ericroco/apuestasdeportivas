import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { COLAS } from '../colas/nombres.js';
import { AceptacionService } from './aceptacion.service.js';

export interface TrabajoApuestaVivo {
  readonly solicitudId: string;
}

/**
 * Resuelve cada apuesta en vivo cuando termina su retardo (research.md §6, FR-018). El trabajo vive en Redis, así
 * que sobrevive a un reinicio de la API. Los errores transitorios se relanzan y BullMQ reintenta con espera
 * exponencial; la resolución es idempotente.
 */
@Processor(COLAS.apuestasVivo, { concurrency: 5 })
export class VivoProcessor extends WorkerHost {
  constructor(private readonly aceptacion: AceptacionService) {
    super();
  }

  async process(trabajo: Job<TrabajoApuestaVivo>): Promise<void> {
    await this.aceptacion.resolverSolicitudVivo(trabajo.data.solicitudId);
  }
}
