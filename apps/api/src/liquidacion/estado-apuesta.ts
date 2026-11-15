import type { EstadoApuesta, ResultadoSeleccion } from '@apuestas/shared';
import { Decimal, multiplicar, redondear } from '../comun/decimal.js';

export interface SeleccionLiquidable {
  readonly resultado: ResultadoSeleccion;
  readonly cuotaCongelada: Decimal;
}

export interface Liquidacion {
  readonly estado: EstadoApuesta;
  /** Cuota con la que se paga: la congelada, con 1.00 en las selecciones anuladas. */
  readonly cuotaEfectiva: Decimal;
  /** Premio si ganó, reembolso del monto si se anuló, 0 si perdió o sigue pendiente. */
  readonly montoAPagar: Decimal;
}

/**
 * Estado de una apuesta a partir del resultado de sus selecciones (data-model.md, "Reglas de liquidación").
 * Combinada: PERDIDA si alguna perdió; si no, PENDIENTE mientras falte alguna; si no, ANULADA si todas se anularon
 * (reembolso completo); si no, GANADA con el producto de las cuotas, contando 1.00 las anuladas (FR-026, FR-035).
 * Una simple es el caso de una sola selección.
 */
export function calcularLiquidacion(
  monto: Decimal,
  selecciones: readonly SeleccionLiquidable[],
): Liquidacion {
  const resultados = selecciones.map((s) => s.resultado);
  const cuotaEfectiva = multiplicar(
    ...selecciones.map((s) => (s.resultado === 'ANULADA' ? new Decimal(1) : s.cuotaCongelada)),
  );
  const sinPago = { cuotaEfectiva, montoAPagar: new Decimal(0) };

  if (resultados.includes('PERDEDORA')) return { estado: 'PERDIDA', ...sinPago };
  if (resultados.includes('PENDIENTE')) return { estado: 'PENDIENTE', ...sinPago };
  if (resultados.every((r) => r === 'ANULADA')) {
    return { estado: 'ANULADA', cuotaEfectiva, montoAPagar: redondear(monto) };
  }
  return { estado: 'GANADA', cuotaEfectiva, montoAPagar: redondear(monto.times(cuotaEfectiva)) };
}
