/**
 * Resultado de una consulta del servidor web a la API o a reportes. Las pantallas deciden qué mostrar a
 * partir del `tipo`; nunca reciben el token ni la respuesta cruda.
 */
export type FalloConsulta =
  /** Sin cookie `acceso`, o la API/reportes respondió 401. */
  | { readonly tipo: 'sin-sesion' }
  /** 403: hay sesión, pero el rol no alcanza. */
  | { readonly tipo: 'sin-permiso' }
  /** 5xx, sin respuesta, tiempo agotado o respuesta que no cumple el contrato. */
  | { readonly tipo: 'no-disponible'; readonly codigo?: string }
  /** 4xx con el `codigo` estable del contrato (datos inválidos, duplicado, conflicto…). */
  | {
      readonly tipo: 'rechazo';
      readonly estado: number;
      readonly codigo: string;
      readonly mensaje: string;
    };

export type Resultado<T> = { readonly tipo: 'ok'; readonly datos: T } | FalloConsulta;

export type TipoFallo = FalloConsulta['tipo'];
