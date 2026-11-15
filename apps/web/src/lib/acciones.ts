import { mensajeDeFallo } from './mensajes';
import type { Resultado } from './resultado';

/** Estado que devuelven las Server Actions de una sola acción (pausar, extender, resolver…). */
export interface EstadoAccion {
  readonly resultado: 'inicial' | 'exito' | 'error';
  readonly mensaje: string;
  /** Cambia en cada respuesta para que el mensaje se vuelva a anunciar aunque repita el texto. */
  readonly intento: number;
}

export const ACCION_INICIAL: EstadoAccion = { resultado: 'inicial', mensaje: '', intento: 0 };

export function accionFallida(previo: EstadoAccion, mensaje: string): EstadoAccion {
  return { resultado: 'error', mensaje, intento: previo.intento + 1 };
}

export function accionExitosa(previo: EstadoAccion, mensaje: string): EstadoAccion {
  return { resultado: 'exito', mensaje, intento: previo.intento + 1 };
}

/** Traduce el resultado de la API al estado de la acción, con el mensaje de éxito indicado. */
export function estadoDesdeResultado<T>(
  previo: EstadoAccion,
  resultado: Resultado<T>,
  mensajeExito: (datos: T) => string,
): EstadoAccion {
  return resultado.tipo === 'ok'
    ? accionExitosa(previo, mensajeExito(resultado.datos))
    : accionFallida(previo, mensajeDeFallo(resultado));
}
