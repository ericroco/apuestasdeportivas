import type { CodigoErrorNegocio } from '@apuestas/shared';
import { HttpStatus } from '@nestjs/common';
import { ErrorNegocio } from './error-negocio.js';

/** Estado HTTP de cada código del Spec 3 (specs/003-partidos-apuestas-liquidacion/contracts/api-rest.md). */
const ESTADO_POR_CODIGO: Readonly<Record<CodigoErrorNegocio, HttpStatus>> = {
  CUOTA_CAMBIADA: HttpStatus.CONFLICT,
  TRANSICION_INVALIDA: HttpStatus.CONFLICT,
  PARTIDO_CON_APUESTAS: HttpStatus.CONFLICT,
  SALDO_INSUFICIENTE: HttpStatus.UNPROCESSABLE_ENTITY,
  SALDO_NEGATIVO: HttpStatus.UNPROCESSABLE_ENTITY,
  MERCADO_CERRADO: HttpStatus.UNPROCESSABLE_ENTITY,
  LIMITE_EXCEDIDO: HttpStatus.UNPROCESSABLE_ENTITY,
  COMBINADA_INVALIDA: HttpStatus.UNPROCESSABLE_ENTITY,
  CUPON_INVALIDO: HttpStatus.UNPROCESSABLE_ENTITY,
  ROL_NO_PUEDE_APOSTAR: HttpStatus.FORBIDDEN,
};

/**
 * Crea el `ErrorNegocio` compartido (comun/error-negocio.ts) para un código del Spec 3, con su estado HTTP fijo:
 * así un mismo código siempre responde igual y el compilador impide códigos fuera del contrato.
 */
export function errorApuestas(
  codigo: CodigoErrorNegocio,
  mensaje: string,
  datos: Record<string, unknown> = {},
): ErrorNegocio {
  return new ErrorNegocio(codigo, ESTADO_POR_CODIGO[codigo], mensaje, Object.freeze({ ...datos }));
}
