import { aTexto, Decimal, multiplicar, redondear } from '../comun/decimal.js';
import { errorApuestas } from '../comun/errores-apuestas.js';

/**
 * Reglas puras de la aceptación de apuestas (research.md §4 y §5, FR-019). Todo con Decimal, nunca `number`.
 */

export interface Limites {
  readonly montoMin: Decimal;
  readonly montoMax: Decimal;
  /** Monto total apostado por usuario y día calendario de America/Guayaquil. */
  readonly diario: Decimal;
  readonly gananciaMax: Decimal;
}

/** Cuota total: producto de las cuotas congeladas, redondeado una sola vez al final. */
export function calcularCuotaTotal(cuotas: readonly Decimal[]): Decimal {
  return multiplicar(...cuotas);
}

export function calcularGanancia(monto: Decimal, cuotaTotal: Decimal): Decimal {
  return redondear(monto.times(cuotaTotal));
}

export interface ValidacionLimites {
  readonly monto: Decimal;
  readonly cuota: Decimal;
  readonly apostadoHoy: Decimal;
  readonly limites: Limites;
}

/** Lanza LIMITE_EXCEDIDO con el límite superado y el valor que sí se permite (contracts/api-rest.md). */
export function validarLimites({ monto, cuota, apostadoHoy, limites }: ValidacionLimites): void {
  if (monto.lessThan(limites.montoMin)) {
    excedido(
      'MONTO_MIN',
      limites.montoMin,
      `El monto mínimo por apuesta es ${aTexto(limites.montoMin)}.`,
    );
  }
  if (monto.greaterThan(limites.montoMax)) {
    excedido(
      'MONTO_MAX',
      limites.montoMax,
      `El monto máximo por apuesta es ${aTexto(limites.montoMax)}.`,
    );
  }
  const disponibleHoy = Decimal.max(limites.diario.minus(apostadoHoy), 0);
  if (monto.greaterThan(disponibleHoy)) {
    excedido(
      'DIARIO',
      disponibleHoy,
      `Superas tu límite diario de ${aTexto(limites.diario)}: hoy puedes apostar hasta ${aTexto(disponibleHoy)}.`,
    );
  }
  if (calcularGanancia(monto, cuota).greaterThan(limites.gananciaMax)) {
    // Hacia abajo: con el monto sugerido la ganancia no vuelve a superar el máximo.
    const montoPermitido = limites.gananciaMax
      .dividedBy(cuota)
      .toDecimalPlaces(2, Decimal.ROUND_DOWN);
    excedido(
      'GANANCIA_MAX',
      montoPermitido,
      `La ganancia potencial supera el máximo de ${aTexto(limites.gananciaMax)}: ` +
        `con esa cuota puedes apostar hasta ${aTexto(montoPermitido)}.`,
    );
  }
}

function excedido(limite: string, valorPermitido: Decimal, mensaje: string): never {
  throw errorApuestas('LIMITE_EXCEDIDO', mensaje, {
    limite,
    valorPermitido: aTexto(valorPermitido),
  });
}

/** Una combinada: de 2 al máximo de selecciones, todas de partidos distintos (FR-014). */
export function validarCombinada(partidoIds: readonly string[], maximo: number): void {
  if (partidoIds.length < 2) return;
  if (partidoIds.length > maximo) {
    throw errorApuestas(
      'COMBINADA_INVALIDA',
      `Una combinada admite como máximo ${maximo} selecciones.`,
      { maximo },
    );
  }
  if (new Set(partidoIds).size !== partidoIds.length) {
    throw errorApuestas(
      'COMBINADA_INVALIDA',
      'No puedes combinar dos selecciones del mismo partido.',
    );
  }
}

/** Ecuador continental no tiene horario de verano: UTC-5 todo el año. */
const DESFASE_GUAYAQUIL_MS = -5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Inicio del día calendario de America/Guayaquil que contiene `ahora`, en UTC (research.md §5). */
export function inicioDelDiaLocal(ahora: Date): Date {
  const local = ahora.getTime() + DESFASE_GUAYAQUIL_MS;
  return new Date(Math.floor(local / DIA_MS) * DIA_MS - DESFASE_GUAYAQUIL_MS);
}
