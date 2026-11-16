import type { CodigoSeleccion, TipoMercado } from '@apuestas/shared';
import { BadRequestException } from '@nestjs/common';
import { cuotaTexto } from '../comun/decimal.js';

/** Selecciones obligatorias de cada tipo de mercado (FR-004, research.md §10). */
export const SELECCIONES_POR_TIPO: Readonly<Record<TipoMercado, readonly CodigoSeleccion[]>> =
  Object.freeze({
    RESULTADO_FINAL: ['LOCAL', 'EMPATE', 'VISITANTE'],
    DOBLE_OPORTUNIDAD: ['LOCAL_EMPATE', 'EMPATE_VISITANTE', 'LOCAL_VISITANTE'],
    MAS_MENOS_GOLES: ['MAS', 'MENOS'],
    AMBOS_MARCAN: ['SI', 'NO'],
  });

/** Línea de medio gol (0.5, 1.5, 2.5…): nunca hay empate con la línea. */
const PATRON_LINEA = /^\d{1,2}\.5$/;

export interface DefinicionMercado {
  readonly tipo: TipoMercado;
  readonly linea: string | null;
  readonly selecciones: ReadonlyArray<{ readonly codigo: CodigoSeleccion; readonly cuota: string }>;
}

/**
 * Valida un mercado antes de crearlo: selecciones completas y sin repetir para su tipo, línea .5 solo en
 * MAS_MENOS_GOLES y cuotas > 1.00 con dos decimales. Lanza 400 con todos los problemas encontrados.
 */
export function validarMercado(mercado: DefinicionMercado): void {
  const problemas = [...problemasDeLinea(mercado), ...problemasDeSelecciones(mercado)];
  if (problemas.length) throw new BadRequestException(`Mercado inválido: ${problemas.join('; ')}`);
}

function problemasDeLinea({ tipo, linea }: DefinicionMercado): string[] {
  if (tipo === 'MAS_MENOS_GOLES') {
    return linea !== null && PATRON_LINEA.test(linea)
      ? []
      : ['la línea de MAS_MENOS_GOLES debe ser de medio gol (0.5, 1.5, 2.5…)'];
  }
  return linea === null ? [] : [`un mercado ${tipo} no lleva línea`];
}

function problemasDeSelecciones({ tipo, selecciones }: DefinicionMercado): string[] {
  const esperadas = SELECCIONES_POR_TIPO[tipo];
  const codigos = selecciones.map((s) => s.codigo);
  const problemas: string[] = [];

  const repetidas = codigos.filter((codigo, i) => codigos.indexOf(codigo) !== i);
  if (repetidas.length) problemas.push(`selección repetida: ${[...new Set(repetidas)].join(', ')}`);

  const ajenas = codigos.filter((codigo) => !esperadas.includes(codigo));
  if (ajenas.length)
    problemas.push(`selecciones que no pertenecen a ${tipo}: ${ajenas.join(', ')}`);

  const faltantes = esperadas.filter((codigo) => !codigos.includes(codigo));
  if (faltantes.length) problemas.push(`faltan selecciones de ${tipo}: ${faltantes.join(', ')}`);

  for (const { codigo, cuota } of selecciones) {
    if (!cuotaTexto.safeParse(cuota).success) {
      problemas.push(`la cuota de ${codigo} debe ser mayor a 1.00 con hasta dos decimales`);
    }
  }
  return problemas;
}
