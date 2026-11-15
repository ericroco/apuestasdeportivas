import { ESTADOS_CUPON, TIPOS_CUPON, type EstadoCupon, type TipoCupon } from '@apuestas/shared';
import {
  construirConsulta,
  leerPagina,
  primerValor,
  valorPermitido,
  type ParametrosBusqueda,
} from '@/lib/parametros';

/** Filtros de la lista de cupones, tal como viajan en la URL de `/operador/cupones`. */
export interface FiltrosCupones {
  readonly estado?: EstadoCupon;
  readonly tipo?: TipoCupon;
  /** Prefijo del código (letras y números, como los códigos). */
  readonly busqueda?: string;
  readonly pagina: number;
}

const LARGO_MAXIMO_CODIGO = 20;

export function leerFiltrosCupones(parametros: ParametrosBusqueda): FiltrosCupones {
  const busqueda = primerValor(parametros, 'busqueda')
    ?.replace(/[^A-Za-z0-9]/g, '')
    .slice(0, LARGO_MAXIMO_CODIGO);
  return {
    estado: valorPermitido(parametros, 'estado', ESTADOS_CUPON),
    tipo: valorPermitido(parametros, 'tipo', TIPOS_CUPON),
    busqueda: busqueda || undefined,
    pagina: leerPagina(parametros),
  };
}

export function hayFiltrosCupones({ estado, tipo, busqueda }: FiltrosCupones): boolean {
  return Boolean(estado || tipo || busqueda);
}

/** URL de la lista con los filtros, para compartirla, paginar o reintentar. */
export function hrefCupones({ estado, tipo, busqueda }: FiltrosCupones, pagina = 1): string {
  const consulta = construirConsulta({
    estado,
    tipo,
    busqueda,
    pagina: pagina === 1 ? undefined : pagina,
  });
  return `/operador/cupones${consulta}`;
}
