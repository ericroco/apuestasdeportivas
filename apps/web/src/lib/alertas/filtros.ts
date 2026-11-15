import {
  ESTADOS_ALERTA,
  REGLAS_FRAUDE,
  SEVERIDADES_ALERTA,
  type EstadoAlerta,
  type ReglaFraude,
  type SeveridadAlerta,
} from '@apuestas/shared';
import {
  construirConsulta,
  fechaCalendario,
  leerPagina,
  primerValor,
  valorPermitido,
  type ParametrosBusqueda,
} from '@/lib/parametros';

/** Filtros de la lista de alertas, tal como viajan en la URL de `/admin/alertas`. */
export interface FiltrosAlertas {
  readonly estado?: EstadoAlerta;
  readonly severidad?: SeveridadAlerta;
  readonly regla?: ReglaFraude;
  readonly usuarioId?: string;
  /** Día `AAAA-MM-DD` (UTC), incluido. */
  readonly desde?: string;
  /** Día `AAAA-MM-DD` (UTC), incluido. */
  readonly hasta?: string;
  readonly pagina: number;
}

const FORMATO_USUARIO = /^[\w@.+-]{1,100}$/;

export function leerFiltrosAlertas(parametros: ParametrosBusqueda): FiltrosAlertas {
  const usuarioId = primerValor(parametros, 'usuarioId');
  return {
    estado: valorPermitido(parametros, 'estado', ESTADOS_ALERTA),
    severidad: valorPermitido(parametros, 'severidad', SEVERIDADES_ALERTA),
    regla: valorPermitido(parametros, 'regla', REGLAS_FRAUDE),
    usuarioId: usuarioId && FORMATO_USUARIO.test(usuarioId) ? usuarioId : undefined,
    desde: fechaCalendario(parametros, 'desde'),
    hasta: fechaCalendario(parametros, 'hasta'),
    pagina: leerPagina(parametros),
  };
}

export function hayFiltrosAlertas(filtros: FiltrosAlertas): boolean {
  const { estado, severidad, regla, usuarioId, desde, hasta } = filtros;
  return Boolean(estado || severidad || regla || usuarioId || desde || hasta);
}

/** URL de la lista con los filtros, para compartirla, paginar o reintentar. */
export function hrefAlertas(filtros: FiltrosAlertas, pagina = 1): string {
  const { estado, severidad, regla, usuarioId, desde, hasta } = filtros;
  const consulta = construirConsulta({
    estado,
    severidad,
    regla,
    usuarioId,
    desde,
    hasta,
    pagina: pagina === 1 ? undefined : pagina,
  });
  return `/admin/alertas${consulta}`;
}
