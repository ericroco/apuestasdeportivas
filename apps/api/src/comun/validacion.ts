import { HttpStatus, StandardSchemaValidationPipe } from '@nestjs/common';
import { z } from 'zod';
import { ErrorNegocio } from './error-negocio.js';

/** Máximo de problemas que se listan en el mensaje; el resto se resume. */
const MAX_PROBLEMAS_EN_MENSAJE = 10;

interface ProblemaDeValidacion {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

function describir(problema: ProblemaDeValidacion): string {
  if (!problema.path?.length) return problema.message;
  const ruta = problema.path
    .map((segmento) => String(typeof segmento === 'object' ? segmento.key : segmento))
    .join('.');
  return `${ruta}: ${problema.message}`;
}

/** Error 400 `DATOS_INVALIDOS` cuyo mensaje nombra cada campo a corregir (contracts/api-rest.md). */
export function crearErrorDeValidacion(problemas: readonly ProblemaDeValidacion[]): ErrorNegocio {
  const listados = problemas.slice(0, MAX_PROBLEMAS_EN_MENSAJE).map(describir);
  const restantes = problemas.length - listados.length;
  if (restantes > 0) listados.push(`y ${restantes} problemas más`);
  return new ErrorNegocio('DATOS_INVALIDOS', HttpStatus.BAD_REQUEST, listados.join('; '));
}

/**
 * Pipe global que valida los parámetros declarados con `{ schema }` (`@Body({ schema })`, `@Query({ schema })`…).
 * Sin un pipe registrado, `schema` no valida nada: por eso se registra en `configurarApp`.
 */
export function crearPipeDeValidacion(): StandardSchemaValidationPipe {
  // Mensajes de zod en español para que el cliente sepa qué corregir.
  z.config(z.locales.es());
  return new StandardSchemaValidationPipe({ exceptionFactory: crearErrorDeValidacion });
}
