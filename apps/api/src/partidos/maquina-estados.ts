import type { EstadoPartido } from '@apuestas/shared';
import { ErrorNegocio } from '../comun/error-negocio.js';

/** Transiciones permitidas del partido (data-model.md, FR-002). Cualquier otra se rechaza. */
const TRANSICIONES: Readonly<Record<EstadoPartido, readonly EstadoPartido[]>> = Object.freeze({
  PROGRAMADO: ['EN_VIVO', 'APLAZADO', 'CANCELADO'],
  EN_VIVO: ['FINALIZADO', 'SUSPENDIDO', 'CANCELADO'],
  SUSPENDIDO: ['EN_VIVO', 'CANCELADO'],
  // Volver a PROGRAMADO exige una nueva hora de inicio (lo valida PartidosService).
  APLAZADO: ['PROGRAMADO', 'CANCELADO'],
  // Finales: el resultado de un partido finalizado solo cambia por corrección (FR-036).
  FINALIZADO: [],
  CANCELADO: [],
});

export function transicionesPermitidas(desde: EstadoPartido): readonly EstadoPartido[] {
  return TRANSICIONES[desde];
}

/** Lanza TRANSICION_INVALIDA (409) con las transiciones permitidas si `desde → hacia` no está en la tabla. */
export function validarTransicion(desde: EstadoPartido, hacia: EstadoPartido): void {
  const permitidas = TRANSICIONES[desde];
  if (!permitidas.includes(hacia)) {
    const opciones = permitidas.length ? permitidas.join(', ') : 'ninguna (estado final)';
    throw new ErrorNegocio(
      'TRANSICION_INVALIDA',
      `No se puede pasar el partido de ${desde} a ${hacia}. Transiciones permitidas: ${opciones}.`,
      { desde, hacia, permitidas: [...permitidas] },
    );
  }
}

export function esEstadoFinal(estado: EstadoPartido): boolean {
  return TRANSICIONES[estado].length === 0;
}

/** Estados en los que un mercado abierto puede recibir apuestas (FR-017, FR-032). */
export function admiteApuestas(estado: EstadoPartido): boolean {
  return estado === 'PROGRAMADO' || estado === 'EN_VIVO';
}
