import type { EstadoCupon, TipoCupon, VistaCupon } from '@apuestas/shared';
import { formatearMonto, formatearPorcentaje } from '@/lib/formato';

/** Cómo se nombran y describen los cupones en la interfaz del operador. */

export const NOMBRE_TIPO: Readonly<Record<TipoCupon, string>> = {
  BONO_DEPOSITO: 'Bono de depósito',
  APUESTA_GRATIS: 'Apuesta gratis',
  AUMENTO_CUOTA: 'Aumento de cuota',
};

export const DESCRIPCION_TIPO: Readonly<Record<TipoCupon, string>> = {
  BONO_DEPOSITO: 'Un porcentaje del depósito como saldo de bono, con tope y depósito mínimo.',
  APUESTA_GRATIS: 'Un monto fijo de bono para una apuesta que no lo supere.',
  AUMENTO_CUOTA: 'Un porcentaje extra sobre la cuota total, con un monto máximo de apuesta.',
};

export const NOMBRE_ESTADO: Readonly<Record<EstadoCupon, string>> = {
  ACTIVO: 'Activo',
  PAUSADO: 'Pausado',
};

export type EstadoVisibleCupon = 'activo' | 'pausado' | 'fuera-de-vigencia' | 'agotado';

export const NOMBRE_ESTADO_VISIBLE: Readonly<Record<EstadoVisibleCupon, string>> = {
  activo: 'Activo',
  pausado: 'Pausado',
  'fuera-de-vigencia': 'Fuera de vigencia',
  agotado: 'Agotado',
};

type ValoresCupon = Pick<
  VistaCupon,
  'tipo' | 'porcentaje' | 'montoFijo' | 'topeBono' | 'depositoMinimo' | 'apuestaMaxima'
>;

function monto(texto: string | null): string {
  return texto === null ? '—' : formatearMonto(texto);
}

function porcentaje(texto: string | null): string {
  return texto === null ? '—' : formatearPorcentaje(texto);
}

/** Qué otorga el cupón, en una frase. */
export function valorCupon(cupon: ValoresCupon): string {
  switch (cupon.tipo) {
    case 'BONO_DEPOSITO':
      return `${porcentaje(cupon.porcentaje)} del depósito, hasta ${monto(cupon.topeBono)}`;
    case 'APUESTA_GRATIS':
      return `Apuesta gratis de ${monto(cupon.montoFijo)}`;
    case 'AUMENTO_CUOTA':
      return `+${porcentaje(cupon.porcentaje)} a la cuota total`;
  }
}

/** La condición de uso del tipo, o `null` si no tiene. */
export function condicionesCupon(cupon: ValoresCupon): string | null {
  switch (cupon.tipo) {
    case 'BONO_DEPOSITO':
      return `Depósito mínimo ${monto(cupon.depositoMinimo)}`;
    case 'APUESTA_GRATIS':
      return 'La apuesta no puede superar el monto del cupón';
    case 'AUMENTO_CUOTA':
      return `Apuesta máxima ${monto(cupon.apuestaMaxima)}`;
  }
}

/**
 * Estado que ve el operador. `vigente` lo calcula la API con su reloj; aquí solo se elige la etiqueta
 * (un cupón activo puede no aceptar canjes por estar fuera de su vigencia o sin cupo).
 */
export function estadoVisible(
  cupon: Pick<VistaCupon, 'estado' | 'vigente' | 'canjes' | 'cupoTotal'>,
): EstadoVisibleCupon {
  if (cupon.estado === 'PAUSADO') return 'pausado';
  if (cupon.canjes >= cupon.cupoTotal) return 'agotado';
  return cupon.vigente ? 'activo' : 'fuera-de-vigencia';
}
