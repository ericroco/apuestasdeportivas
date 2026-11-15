import { HttpStatus } from '@nestjs/common';
import { ErrorNegocio } from './error-negocio.js';

/**
 * Un puerto de otro spec (billetera, auditoría) todavía no está integrado. Se lanza ANTES de escribir nada,
 * para que la operación falle sin efectos parciales (research.md §7).
 */
export class DependenciaNoDisponibleError extends ErrorNegocio {
  override readonly name = 'DependenciaNoDisponibleError';

  constructor(dependencia: string) {
    super(
      'DEPENDENCIA_NO_DISPONIBLE',
      HttpStatus.SERVICE_UNAVAILABLE,
      `El servicio de ${dependencia} no está disponible todavía. Intenta más tarde.`,
    );
  }
}

/** Devuelve el puerto inyectado con `@Optional()` o lanza `DependenciaNoDisponibleError` si falta. */
export function requerir<T>(puerto: T | null | undefined, dependencia: string): T {
  if (puerto === null || puerto === undefined) throw new DependenciaNoDisponibleError(dependencia);
  return puerto;
}
