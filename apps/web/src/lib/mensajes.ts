import type { FalloConsulta } from './resultado';

/**
 * Mensajes para el resultado de una acción (crear, pausar, resolver…). Explican qué pasó y cómo seguir;
 * los `codigo` del contrato (contracts/api-rest.md) se traducen a algo que el operador pueda hacer.
 */

const MENSAJES_RECHAZO: Readonly<Record<string, string>> = {
  CODIGO_DUPLICADO:
    'Ya existe un cupón con ese código (no se distinguen mayúsculas). Elige otro código.',
  CUPON_CON_CANJES:
    'El cupón ya tiene canjes: solo puedes pausarlo, extender su vigencia o ampliar su cupo.',
  CAMBIO_NO_PERMITIDO:
    'La vigencia solo se puede extender y el cupo solo se puede ampliar. Elige una fecha posterior o un cupo mayor al actual.',
  NO_ENCONTRADO: 'Ya no existe. Vuelve a la lista para ver los datos actuales.',
  ALERTA_RESUELTA:
    'Otra persona ya resolvió esta alerta. Recarga la página para ver su resolución.',
};

export const MENSAJE_SIN_SESION =
  'Tu sesión no está activa o venció. Inicia sesión y vuelve a intentarlo.';
export const MENSAJE_SIN_PERMISO = 'Tu cuenta no tiene permiso para esta acción.';
export const MENSAJE_NO_DISPONIBLE =
  'El servicio no está disponible, reintenta en unos minutos. No se guardó ningún cambio.';

export function mensajeDeFallo(fallo: FalloConsulta): string {
  switch (fallo.tipo) {
    case 'sin-sesion':
      return MENSAJE_SIN_SESION;
    case 'sin-permiso':
      return MENSAJE_SIN_PERMISO;
    case 'no-disponible':
      return MENSAJE_NO_DISPONIBLE;
    case 'rechazo':
      if (fallo.codigo === 'DATOS_INVALIDOS') return `Revisa los datos: ${fallo.mensaje}`;
      return MENSAJES_RECHAZO[fallo.codigo] ?? fallo.mensaje;
  }
}
