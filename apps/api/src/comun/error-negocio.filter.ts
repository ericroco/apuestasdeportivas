import { STATUS_CODES } from 'node:http';
import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorNegocio } from './error-negocio.js';

/** Formato uniforme de errores del Spec 1 más `codigo` y los datos del error de negocio. */
@Catch(ErrorNegocio)
export class ErrorNegocioFilter implements ExceptionFilter<ErrorNegocio> {
  catch(error: ErrorNegocio, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    respuesta.status(error.estadoHttp).json({
      // Los datos van primero: no pueden sobrescribir los campos del formato.
      ...error.datos,
      statusCode: error.estadoHttp,
      error: STATUS_CODES[error.estadoHttp] ?? 'Error',
      codigo: error.codigo,
      message: error.message,
    });
  }
}
