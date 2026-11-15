import type { Logger } from '@nestjs/common';
import type { OnEventOptions } from '@nestjs/event-emitter';

/**
 * Opciones de todo listener de eventos de dominio del Spec 4 (research.md §6): se ejecuta de forma asíncrona y
 * `emitAsync` puede esperar su promesa. Los eventos se emiten tras confirmar la transacción del emisor.
 */
export const OPCIONES_LISTENER: OnEventOptions = { async: true, promisify: true };

/** Esperas entre reintentos de un error transitorio (ms): hasta 3 reintentos con espera creciente. */
export const ESPERAS_REINTENTO_MS: readonly number[] = [200, 1_000, 3_000];

/** Códigos de Prisma (timeouts de transacción o pool, conflicto/deadlock, base inaccesible) y de PostgreSQL. */
const CODIGOS_TRANSITORIOS = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2028',
  'P2034',
  '40001',
  '40P01',
  '57P01',
  '08006',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
]);
const PROFUNDIDAD_CAUSAS = 3;

function codigosDe(error: unknown, nivel = 0): string[] {
  if (typeof error !== 'object' || error === null || nivel > PROFUNDIDAD_CAUSAS) return [];
  const { code, meta, cause } = error as { code?: unknown; meta?: unknown; cause?: unknown };
  const propios = [code, (meta as { code?: unknown } | null | undefined)?.code];
  return [
    ...propios.filter((valor): valor is string => typeof valor === 'string'),
    ...codigosDe(cause, nivel + 1),
  ];
}

/** `true` si el error es una falla pasajera de la base (timeout, serialización, deadlock, conexión). */
export function esErrorTransitorio(error: unknown): boolean {
  return codigosDe(error).some((codigo) => CODIGOS_TRANSITORIOS.has(codigo));
}

export interface OpcionesReintento {
  /** Esperas entre intentos (ms); un reintento por espera. */
  readonly esperas?: readonly number[];
  /** Sustituible en pruebas para no esperar de verdad. */
  readonly dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Ejecuta la tarea y, si falla con un error transitorio, la repite tras cada espera. Un error no transitorio se
 * propaga de inmediato; al agotar los reintentos se propaga el último. Solo para tareas idempotentes.
 */
export async function conReintentos<T>(
  tarea: () => Promise<T>,
  { esperas = ESPERAS_REINTENTO_MS, dormir = dormirReal }: OpcionesReintento = {},
): Promise<T> {
  for (const espera of esperas) {
    try {
      return await tarea();
    } catch (error) {
      if (!esErrorTransitorio(error)) throw error;
      await dormir(espera);
    }
  }
  return tarea();
}

export interface OpcionesEjecucion extends OpcionesReintento {
  /** Identificadores (no datos personales) que se añaden al log de error, p. ej. `depositoId=… usuarioId=…`. */
  readonly contexto?: string;
}

/**
 * Ejecuta el trabajo de un listener sin propagar el error al emisor: reintenta las fallas transitorias (la tarea
 * debe ser idempotente) y, si persisten o no lo son, las registra con el `Logger` sin el contenido del evento,
 * que puede tener datos personales. El emisor puede repetir el evento: los listeners son idempotentes.
 * Una cola persistente (BullMQ, Spec 3) es la mejora futura para no perder el trabajo ante caídas largas.
 */
export async function ejecutarSinPropagar(
  logger: Logger,
  evento: string,
  tarea: () => Promise<unknown>,
  opciones: OpcionesEjecucion = {},
): Promise<void> {
  try {
    await conReintentos(tarea, opciones);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    const donde = opciones.contexto ? `${evento} (${opciones.contexto})` : evento;
    logger.error(`${donde}: ${mensaje}`, error instanceof Error ? error.stack : undefined);
  }
}
