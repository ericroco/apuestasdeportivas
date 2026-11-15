import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { COLAS } from '../colas/nombres.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.constants.js';
import { calcularIntervaloVivoMs } from './frecuencia.js';
import { ImportacionService, type ResumenImportacion } from './importacion.service.js';
import { fechaUtc, PresupuestoService } from './presupuesto.service.js';
import {
  PresupuestoAgotadoError,
  PROVEEDOR_DEPORTIVO,
  type ProveedorDeportivo,
  ProveedorNoDisponibleError,
} from './proveedor-deportivo.port.js';

export const TRABAJOS = {
  partidosDelDia: 'partidos-del-dia',
  cuotas: 'cuotas',
  vivo: 'vivo',
} as const;

const HORA_MS = 60 * 60 * 1000;
const PROGRAMACION = [
  { nombre: TRABAJOS.partidosDelDia, cadaMs: 6 * HORA_MS },
  { nombre: TRABAJOS.cuotas, cadaMs: 12 * HORA_MS },
  // El ciclo en vivo despierta cada 15 s, pero solo consulta cuando toca según la frecuencia adaptativa.
  { nombre: TRABAJOS.vivo, cadaMs: 15_000 },
] as const;

const CLAVE_ULTIMA_VIVO = 'api-football:ultima-consulta-vivo';
const claveTemporada = (liga: number) => `api-football:temporada:${liga}`;

/**
 * Único worker de sincronización (constitución V): cola `sincronizacion` con concurrencia 1.
 * No reintenta de inmediato: si el proveedor falla, el próximo ciclo programado es el reintento, así los
 * reintentos no gastan el presupuesto (FR-012). En modo simulación no se programa nada.
 */
@Processor(COLAS.sincronizacion, { concurrency: 1 })
export class SincronizacionProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger('Sincronizacion');

  constructor(
    @InjectQueue(COLAS.sincronizacion) private readonly cola: Queue,
    @Inject(PROVEEDOR_DEPORTIVO) private readonly proveedor: ProveedorDeportivo,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly importacion: ImportacionService,
    private readonly presupuesto: PresupuestoService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Las pruebas ejecutan los ciclos a mano para contar las consultas con exactitud.
    if (this.proveedor.esSimulacion || this.entorno.NODE_ENV === 'test') return;
    for (const { nombre, cadaMs } of PROGRAMACION) {
      await this.cola.upsertJobScheduler(nombre, { every: cadaMs }, { name: nombre });
    }
    await this.cola.add(TRABAJOS.partidosDelDia, {}, { removeOnComplete: true });
  }

  async process(trabajo: Job): Promise<void> {
    try {
      switch (trabajo.name) {
        case TRABAJOS.partidosDelDia:
          await this.cicloDelDia();
          return;
        case TRABAJOS.cuotas:
          await this.cicloCuotas();
          return;
        case TRABAJOS.vivo:
          await this.cicloVivo();
          return;
        default:
          this.logger.warn(`Trabajo desconocido en la cola de sincronización: ${trabajo.name}`);
      }
    } catch (error) {
      if (error instanceof PresupuestoAgotadoError || error instanceof ProveedorNoDisponibleError) {
        this.logger.warn(`${trabajo.name}: ${error.message}; se reintenta en el próximo ciclo`);
        return;
      }
      throw error;
    }
  }

  /** Partidos del día (una consulta para todas las ligas). Guarda la temporada de cada liga para las cuotas. */
  async cicloDelDia(fecha: string = fechaUtc()): Promise<ResumenImportacion> {
    const partidos = await this.proveedor.partidosDelDia(fecha);
    for (const { competicion } of partidos) {
      await this.redis.set(claveTemporada(competicion.idProveedor), competicion.temporada);
    }
    return this.importacion.importarPartidos(partidos);
  }

  /** Cuotas pre-partido de cada liga configurada cuya temporada ya se conoce. */
  async cicloCuotas(fecha: string = fechaUtc()): Promise<number> {
    let mercados = 0;
    for (const liga of this.entorno.API_FOOTBALL_LIGAS) {
      const temporada = Number(await this.redis.get(claveTemporada(liga)));
      if (!temporada) continue;
      mercados += await this.importacion.importarCuotas(
        await this.proveedor.cuotas(liga, temporada, fecha),
      );
    }
    return mercados;
  }

  /**
   * Partidos en vivo con frecuencia adaptativa; después, el resultado final de los que dejaron de estar en
   * vivo, con la reserva del presupuesto (research.md §2).
   */
  async cicloVivo(ahora: number = Date.now()): Promise<void> {
    const enVivo = await this.prisma.partido.findMany({
      where: { estado: 'EN_VIVO', idProveedor: { not: null } },
      select: { idProveedor: true, minuto: true },
    });
    if (enVivo.length === 0) return;

    const { consultas, limite } = await this.presupuesto.consumo();
    const intervalo = calcularIntervaloVivoMs({
      minutosDePartidos: enVivo.map((p) => p.minuto),
      consultas,
      presupuesto: limite,
    });
    const ultima = Number(await this.redis.get(CLAVE_ULTIMA_VIVO));
    if (intervalo !== null && ahora - ultima < intervalo) return;

    let vistos = new Set<number>();
    if (intervalo !== null) {
      await this.redis.set(CLAVE_ULTIMA_VIVO, ahora);
      const actuales = await this.proveedor.partidosEnVivo();
      await this.importacion.importarPartidos(actuales);
      vistos = new Set(actuales.map((p) => p.idProveedor));
    }
    const terminados = enVivo.map((p) => p.idProveedor as number).filter((id) => !vistos.has(id));
    if (intervalo !== null && terminados.length > 0) {
      await this.importacion.importarPartidos(await this.proveedor.partidosPorId(terminados));
    }
  }
}
