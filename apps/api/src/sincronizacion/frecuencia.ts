/**
 * Frecuencia adaptativa de la importación (research.md §2, FR-011): los partidos en vivo se consultan más
 * seguido que el resto, sin superar el presupuesto diario y guardando una reserva para los resultados finales.
 */

/** Nunca se consulta el vivo más seguido que esto. */
export const INTERVALO_MINIMO_VIVO_MS = 15_000;

/** Fracción del presupuesto reservada para consultar el resultado final de los partidos que terminan. */
const FRACCION_RESERVA = 0.1;

/** Duración estimada de un partido en minutos de reloj (90 + descanso + añadido). */
const DURACION_ESTIMADA_MIN = 110;

const MS_POR_MINUTO = 60_000;

export function consultasReservadas(presupuesto: number): number {
  return Math.ceil(presupuesto * FRACCION_RESERVA);
}

export interface Consumo {
  readonly consultas: number;
  readonly presupuesto: number;
}

/** Hay cupo para una consulta que no es el resultado final (no toca la reserva). */
export function hayCupoNormal({ consultas, presupuesto }: Consumo): boolean {
  return consultas < presupuesto - consultasReservadas(presupuesto);
}

export interface EstadoVivo extends Consumo {
  /** Minuto de cada partido en vivo según la última consulta (null si no se sabe). */
  readonly minutosDePartidos: ReadonlyArray<number | null>;
}

/**
 * Intervalo entre consultas en vivo: el tiempo que le queda al partido más largo repartido entre las consultas
 * disponibles (sin la reserva), con un mínimo de 15 s. `null` = no consultar (sin partidos o sin cupo).
 */
export function calcularIntervaloVivoMs(estado: EstadoVivo): number | null {
  if (estado.minutosDePartidos.length === 0) return null;
  const disponibles =
    estado.presupuesto - consultasReservadas(estado.presupuesto) - estado.consultas;
  if (disponibles <= 0) return null;

  const minutosRestantes = Math.max(
    ...estado.minutosDePartidos.map((minuto) => Math.max(1, DURACION_ESTIMADA_MIN - (minuto ?? 0))),
  );
  return Math.max(INTERVALO_MINIMO_VIVO_MS, (minutosRestantes * MS_POR_MINUTO) / disponibles);
}
