import { redondear, type Decimal } from '../comun/montos.js';
import { Prisma, type Cupon, type TipoCupon } from '../generated/prisma/client.js';
import type { CodigoMotivo } from './motivos.js';

/**
 * Reglas puras del canje (sin base de datos). La hora es siempre la del servidor y se recibe como parámetro para
 * poder probarla.
 */

const MS_POR_DIA = 86_400_000;
const CIEN = new Prisma.Decimal(100);

/** Estado, vigencia (`iniciaEn ≤ ahora < terminaEn`) y cupo del cupón (FR-004). */
export function motivoDeDisponibilidad(cupon: Cupon, ahora: Date): CodigoMotivo | null {
  if (cupon.estado === 'PAUSADO') return 'CUPON_PAUSADO';
  if (ahora < cupon.iniciaEn) return 'CUPON_NO_VIGENTE';
  if (ahora >= cupon.terminaEn) return 'CUPON_VENCIDO';
  if (cupon.canjes >= cupon.cupoTotal) return 'CUPON_AGOTADO';
  return null;
}

/** Los cupones que otorgan bono no se apilan ni se dan a usuarios en revisión (FR-007). */
export function otorgaBono(tipo: TipoCupon): boolean {
  return tipo === 'BONO_DEPOSITO' || tipo === 'APUESTA_GRATIS';
}

/** Condiciones del tipo al usarlo en una apuesta (FR-002). */
export function motivoDeApuesta(cupon: Cupon, monto: Decimal): CodigoMotivo | null {
  if (cupon.tipo === 'APUESTA_GRATIS') {
    return cupon.montoFijo && monto.lte(cupon.montoFijo) ? null : 'MONTO_SUPERA_CUPON';
  }
  if (cupon.tipo === 'AUMENTO_CUOTA') {
    return cupon.apuestaMaxima && monto.lte(cupon.apuestaMaxima) ? null : 'MONTO_SUPERA_CUPON';
  }
  return 'TIPO_NO_APLICA';
}

/** Condiciones del bono de depósito: mínimo alcanzado y bono resultante mayor que cero (FR-010). */
export function motivoDeDeposito(cupon: Cupon, monto: Decimal): CodigoMotivo | null {
  if (cupon.tipo !== 'BONO_DEPOSITO' || !cupon.porcentaje || !cupon.topeBono) {
    return 'TIPO_NO_APLICA';
  }
  if (cupon.depositoMinimo && monto.lt(cupon.depositoMinimo)) return 'DEPOSITO_INSUFICIENTE';
  const bono = calcularBonoDeposito(monto, cupon.porcentaje, cupon.topeBono);
  return bono.gt(0) ? null : 'DEPOSITO_INSUFICIENTE';
}

/** Cuota total × (1 + porcentaje / 100), redondeada a dos decimales (FR-008). */
export function calcularCuotaFinal(cuotaTotal: Decimal, porcentaje: Decimal): Decimal {
  return redondear(cuotaTotal.times(CIEN.plus(porcentaje)).dividedBy(CIEN));
}

/**
 * `min(depósito × porcentaje, tope)` (FR-010). Se trunca a centésimos: el bono nunca supera el porcentaje
 * anunciado.
 */
export function calcularBonoDeposito(monto: Decimal, porcentaje: Decimal, tope: Decimal): Decimal {
  const bono = monto
    .times(porcentaje)
    .dividedBy(CIEN)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return Prisma.Decimal.min(bono, tope);
}

/** Requisito de rollover = bono × multiplicador (FR-011). */
export function calcularRequisito(monto: Decimal, multiplicador: number): Decimal {
  return redondear(monto.times(multiplicador));
}

export function calcularVencimiento(otorgadoEn: Date, dias: number): Date {
  return new Date(otorgadoEn.getTime() + dias * MS_POR_DIA);
}
