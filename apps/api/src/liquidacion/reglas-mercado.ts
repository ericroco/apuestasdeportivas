import type { CodigoSeleccion, TipoMercado } from '@apuestas/shared';

/** Resultado de una selección una vez decidida. */
export type Decision = 'GANADORA' | 'PERDEDORA';

export interface SeleccionAResolver {
  readonly tipo: TipoMercado;
  readonly codigo: CodigoSeleccion;
  /** Solo en MAS_MENOS_GOLES, p. ej. "2.5". */
  readonly linea: string | null;
}

const decision = (gana: boolean): Decision => (gana ? 'GANADORA' : 'PERDEDORA');

/**
 * Resuelve una selección con el marcador final del tiempo reglamentario (FR-004, research.md §10). Función pura:
 * la misma entrada siempre da la misma salida, base de la liquidación idempotente.
 */
export function resolverAlFinal(
  seleccion: SeleccionAResolver,
  golesLocal: number,
  golesVisitante: number,
): Decision {
  const total = golesLocal + golesVisitante;
  switch (seleccion.tipo) {
    case 'RESULTADO_FINAL': {
      const ganador =
        golesLocal > golesVisitante
          ? 'LOCAL'
          : golesLocal < golesVisitante
            ? 'VISITANTE'
            : 'EMPATE';
      return decision(seleccion.codigo === ganador);
    }
    case 'DOBLE_OPORTUNIDAD': {
      const ganador =
        golesLocal > golesVisitante
          ? 'LOCAL'
          : golesLocal < golesVisitante
            ? 'VISITANTE'
            : 'EMPATE';
      return decision(seleccion.codigo.split('_').includes(ganador));
    }
    case 'MAS_MENOS_GOLES': {
      const linea = lineaDe(seleccion);
      return decision(seleccion.codigo === 'MAS' ? total > linea : total < linea);
    }
    case 'AMBOS_MARCAN': {
      const ambos = golesLocal > 0 && golesVisitante > 0;
      return decision(seleccion.codigo === 'SI' ? ambos : !ambos);
    }
  }
}

/**
 * Si el marcador parcial ya decide la selección, sin importar lo que pase después (FR-031): "más de N" en cuanto el
 * total supera la línea, y "ambos marcan" en cuanto marcaron los dos. `null` = todavía no está decidida.
 */
export function resolverDecidida(
  seleccion: SeleccionAResolver,
  golesLocal: number,
  golesVisitante: number,
): Decision | null {
  if (seleccion.tipo === 'MAS_MENOS_GOLES') {
    if (golesLocal + golesVisitante <= lineaDe(seleccion)) return null;
    return decision(seleccion.codigo === 'MAS');
  }
  if (seleccion.tipo === 'AMBOS_MARCAN') {
    if (golesLocal === 0 || golesVisitante === 0) return null;
    return decision(seleccion.codigo === 'SI');
  }
  return null;
}

function lineaDe(seleccion: SeleccionAResolver): number {
  if (seleccion.linea === null) throw new Error('Un mercado MAS_MENOS_GOLES necesita su línea');
  return Number(seleccion.linea);
}
