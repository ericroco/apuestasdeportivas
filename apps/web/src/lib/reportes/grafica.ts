import { formatearDia } from '@/lib/formato';
import type { DiaSerie } from '@/lib/servidor/esquemas-reportes';

/**
 * Geometría de la gráfica de columnas del volumen diario, para dibujarla como SVG en el servidor. Los
 * montos de reportes se convierten a número solo para medir alturas: no se suma ni se deriva ninguna
 * métrica (los valores que se leen salen del texto original, en la tabla y en el título de cada columna).
 */

export const ALTO_PLOT = 180;
const MARGEN_SUPERIOR = 18;
const BANDA_EJE_X = 26;
/** Ancho de franja por día en el ancho máximo, y grosor máximo de una columna (24 px). */
const ANCHO_FRANJA_PX = 40;
const ANCHO_MINIMO_PX = 200;
const ANCHO_MAXIMO_COLUMNA_PX = 24;
const FRACCION_COLUMNA = 0.6;
const ETIQUETAS_X_MAXIMAS = 6;
const PASOS_REDONDOS = [1, 2, 2.5, 5, 10];
const LIMITE_COMPACTO = 10_000;

export interface ColumnaGrafica {
  readonly dia: DiaSerie;
  readonly etiqueta: string;
  /** Franja del día (en % del ancho): es también el área que responde al puntero. */
  readonly franjaX: number;
  readonly franjaAncho: number;
  readonly xPct: number;
  readonly anchoPct: number;
  readonly y: number;
  readonly alto: number;
}

export interface MarcaEje {
  readonly texto: string;
  readonly y: number;
}

export interface EtiquetaX {
  readonly texto: string;
  readonly xPct: number;
  readonly ancla: 'start' | 'middle' | 'end';
}

export interface Grafica {
  readonly columnas: readonly ColumnaGrafica[];
  readonly marcas: readonly MarcaEje[];
  readonly etiquetasX: readonly EtiquetaX[];
  readonly altoPlot: number;
  readonly base: number;
  readonly altoTotal: number;
  /** Con pocos días la gráfica no se estira: las columnas no pasan de 24 px. */
  readonly anchoMaximo: number;
}

const formatoEjeCompleto = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const formatoEjeCompacto = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
});

/** Tope del eje: el número redondo (1, 2, 2,5, 5 × 10ⁿ) igual o mayor que el máximo. */
export function maximoRedondo(maximo: number): number {
  if (maximo <= 0) return 1;
  const decada = 10 ** Math.floor(Math.log10(maximo));
  const paso = PASOS_REDONDOS.find((candidato) => candidato * decada >= maximo) ?? 10;
  return paso * decada;
}

export function textoEje(valor: number): string {
  return valor < LIMITE_COMPACTO
    ? formatoEjeCompleto.format(valor)
    : formatoEjeCompacto.format(valor);
}

function etiquetasX(columnas: readonly ColumnaGrafica[]): EtiquetaX[] {
  const ultima = columnas.length - 1;
  const cada = Math.max(1, Math.ceil(columnas.length / ETIQUETAS_X_MAXIMAS));
  return columnas.flatMap((columna, indice) => {
    const marcada = indice === ultima || (indice % cada === 0 && ultima - indice >= cada / 2);
    if (!marcada) return [];
    const ancla = indice === 0 ? 'start' : indice === ultima ? 'end' : 'middle';
    const xPct =
      ancla === 'start' ? 0 : ancla === 'end' ? 100 : columna.franjaX + columna.franjaAncho / 2;
    return [{ texto: columna.etiqueta, xPct, ancla }];
  });
}

export function construirGrafica(dias: readonly DiaSerie[]): Grafica {
  const base = MARGEN_SUPERIOR + ALTO_PLOT;
  const tope = maximoRedondo(Math.max(0, ...dias.map((dia) => Number(dia.volumen))));
  const anchoMaximo = Math.max(dias.length * ANCHO_FRANJA_PX, ANCHO_MINIMO_PX);
  const franjaAncho = 100 / Math.max(1, dias.length);
  const fraccion = Math.min(
    FRACCION_COLUMNA,
    ANCHO_MAXIMO_COLUMNA_PX / (anchoMaximo / dias.length),
  );
  const columnas = dias.map((dia, indice) => {
    const alto = (Math.max(0, Number(dia.volumen)) / tope) * ALTO_PLOT;
    const franjaX = indice * franjaAncho;
    const anchoPct = franjaAncho * fraccion;
    return {
      dia,
      etiqueta: formatearDia(dia.fecha),
      franjaX,
      franjaAncho,
      xPct: franjaX + (franjaAncho - anchoPct) / 2,
      anchoPct,
      y: base - alto,
      alto,
    };
  });
  const marcas = [0, tope / 2, tope].map((valor) => ({
    texto: textoEje(valor),
    y: base - (valor / tope) * ALTO_PLOT,
  }));
  return {
    columnas,
    marcas,
    etiquetasX: etiquetasX(columnas),
    altoPlot: ALTO_PLOT,
    base,
    altoTotal: base + BANDA_EJE_X,
    anchoMaximo,
  };
}
