import { ESTADOS_CUPON, TIPOS_CUPON, type EstadoCupon, type TipoCupon } from '@apuestas/shared';
import { leerPagina, primerValor, valorPermitido, type ParametrosBusqueda } from '@/lib/parametros';

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
