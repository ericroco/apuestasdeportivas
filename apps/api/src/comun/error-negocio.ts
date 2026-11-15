import type { CodigoErrorNegocio } from '@apuestas/shared';

/** Estado HTTP de cada código (specs/003-partidos-apuestas-liquidacion/contracts/api-rest.md). */
const ESTADO_POR_CODIGO: Readonly<Record<CodigoErrorNegocio, number>> = {
  CUOTA_CAMBIADA: 409,
  TRANSICION_INVALIDA: 409,
  PARTIDO_CON_APUESTAS: 409,
  SALDO_INSUFICIENTE: 422,
  SALDO_NEGATIVO: 422,
  MERCADO_CERRADO: 422,
  LIMITE_EXCEDIDO: 422,
  COMBINADA_INVALIDA: 422,
  CUPON_INVALIDO: 422,
  ROL_NO_PUEDE_APOSTAR: 403,
};

/**
 * Regla de negocio incumplida. Lleva un `codigo` estable para que la web muestre la causa y la solución, y
 * datos propios del código (p. ej. `cuotasVigentes`). ErrorNegocioFilter la convierte en respuesta HTTP.
 */
export class ErrorNegocio extends Error {
  override readonly name = 'ErrorNegocio';
  readonly estadoHttp: number;
  readonly datos: Readonly<Record<string, unknown>>;

  constructor(
    readonly codigo: CodigoErrorNegocio,
    mensaje: string,
    datos: Record<string, unknown> = {},
  ) {
    super(mensaje);
    this.estadoHttp = ESTADO_POR_CODIGO[codigo];
    this.datos = Object.freeze({ ...datos });
  }
}
