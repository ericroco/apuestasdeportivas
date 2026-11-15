import type { HttpStatus } from '@nestjs/common';

/**
 * Error de una regla de negocio con un código estable que la web puede traducir a un mensaje útil.
 * `ErrorNegocioFilter` lo responde con el formato uniforme del Spec 1 más `codigo`:
 * `{ statusCode, error, codigo, message, ...datos }`. Lo comparten los specs 3 y 4.
 */
export class ErrorNegocio extends Error {
  override readonly name: string = 'ErrorNegocio';

  constructor(
    readonly codigo: string,
    readonly estadoHttp: HttpStatus,
    mensaje: string,
    /** Datos extra para el cliente (p. ej. `saldoDisponible`); nunca secretos ni trazas. */
    readonly datos: Readonly<Record<string, unknown>> = {},
  ) {
    super(mensaje);
  }
}
