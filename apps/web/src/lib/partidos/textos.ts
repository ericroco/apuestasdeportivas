import type { CodigoSeleccion, EstadoApuesta, EstadoPartido, TipoMercado } from '@apuestas/shared';

/** Nombres que ve el apostador: en su idioma, sin códigos internos. */

export const NOMBRE_ESTADO_PARTIDO: Readonly<Record<EstadoPartido, string>> = {
  PROGRAMADO: 'Por jugarse',
  EN_VIVO: 'En vivo',
  FINALIZADO: 'Finalizado',
  SUSPENDIDO: 'Suspendido',
  APLAZADO: 'Aplazado',
  CANCELADO: 'Cancelado',
};

export const NOMBRE_ESTADO_APUESTA: Readonly<Record<EstadoApuesta, string>> = {
  PENDIENTE: 'Pendiente',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
  ANULADA: 'Anulada y reembolsada',
};

export function nombreMercado(tipo: TipoMercado, linea: string | null): string {
  switch (tipo) {
    case 'RESULTADO_FINAL':
      return 'Resultado final';
    case 'DOBLE_OPORTUNIDAD':
      return 'Doble oportunidad';
    case 'MAS_MENOS_GOLES':
      return `Goles: más o menos de ${linea ?? '?'}`;
    case 'AMBOS_MARCAN':
      return 'Ambos equipos marcan';
  }
}

/** Nombre de una selección con los equipos del partido, p. ej. "Barcelona SC o empate". */
export function nombreSeleccion(
  codigo: CodigoSeleccion,
  local: string,
  visitante: string,
  linea: string | null = null,
): string {
  const nombres: Record<CodigoSeleccion, string> = {
    LOCAL: local,
    EMPATE: 'Empate',
    VISITANTE: visitante,
    LOCAL_EMPATE: `${local} o empate`,
    EMPATE_VISITANTE: `Empate o ${visitante}`,
    LOCAL_VISITANTE: `${local} o ${visitante}`,
    MAS: `Más de ${linea ?? '?'} goles`,
    MENOS: `Menos de ${linea ?? '?'} goles`,
    SI: 'Sí, ambos marcan',
    NO: 'No, al menos uno no marca',
  };
  return nombres[codigo];
}

/** Motivos de rechazo de una apuesta en vivo, explicados con su causa. */
export function motivoRechazoVivo(motivo: string | null): string {
  switch (motivo) {
    case 'MARCADOR_CAMBIO':
      return 'El partido cambió mientras esperabas (gol o cambio de estado). Revisa y vuelve a apostar.';
    case 'CUOTA_CAMBIADA':
      return 'La cuota cambió mientras esperabas. Revisa la nueva cuota y vuelve a apostar.';
    case 'MERCADO_CERRADO':
      return 'El mercado se cerró o suspendió mientras esperabas. No se descontó nada.';
    case 'SALDO_INSUFICIENTE':
      return 'No te alcanzó el saldo al confirmar. No se descontó nada.';
    default:
      return 'La apuesta no se aceptó. No se descontó nada.';
  }
}
