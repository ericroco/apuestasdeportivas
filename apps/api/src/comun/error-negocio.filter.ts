import { STATUS_CODES } from 'node:http';
import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorNegocio } from './error-negocio.js';

export interface CuerpoErrorNegocio {
  readonly statusCode: number;
  readonly error: string;
  readonly codigo: string;
  readonly message: string;
  readonly [dato: string]: unknown;
}

/** Cuerpo de la respuesta: los datos del error primero, para que no pisen los campos del formato. */
export function cuerpoDeError(error: ErrorNegocio): CuerpoErrorNegocio {
  return {
    ...error.datos,
    statusCode: error.estadoHttp,
    error: STATUS_CODES[error.estadoHttp] ?? 'Error',
    codigo: error.codigo,
    message: error.message,
  };
}

/** Responde los `ErrorNegocio` con el formato uniforme; el resto de excepciones sigue el filtro de Nest. */
@Catch(ErrorNegocio)
export class ErrorNegocioFilter implements ExceptionFilter<ErrorNegocio> {
  private readonly logger = new Logger(ErrorNegocioFilter.name);

  catch(error: ErrorNegocio, host: ArgumentsHost): void {
    if (error.estadoHttp >= 500) this.logger.warn(`${error.codigo}: ${error.message}`);
    host.switchToHttp().getResponse<Response>().status(error.estadoHttp).json(cuerpoDeError(error));
  }
}
