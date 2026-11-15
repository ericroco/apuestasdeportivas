import type { Logger } from '@nestjs/common';
import type { OnEventOptions } from '@nestjs/event-emitter';

/**
 * Opciones de todo listener de eventos de dominio del Spec 4 (research.md §6): se ejecuta de forma asíncrona y
 * `emitAsync` puede esperar su promesa. Los eventos se emiten tras confirmar la transacción del emisor.
 */
export const OPCIONES_LISTENER: OnEventOptions = { async: true, promisify: true };

/**
 * Ejecuta el trabajo de un listener sin propagar el error al emisor: lo registra con el `Logger` (sin el
 * contenido del evento, que puede tener datos personales). El emisor puede repetir el evento: los listeners son
 * idempotentes.
 */
export async function ejecutarSinPropagar(
  logger: Logger,
  evento: string,
  tarea: () => Promise<unknown>,
): Promise<void> {
  try {
    await tarea();
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    logger.error(`${evento}: ${mensaje}`, error instanceof Error ? error.stack : undefined);
  }
}
