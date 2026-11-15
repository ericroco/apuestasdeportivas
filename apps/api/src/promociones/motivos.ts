import { CuponInvalidoError } from '../contracts/promociones.port.js';

/** Motivos de rechazo de un canje (data-model.md): código estable y mensaje legible para el apostador. */
export const MOTIVOS = {
  CUPON_INEXISTENTE: 'El cupón no existe.',
  CUPON_PAUSADO: 'El cupón está pausado.',
  CUPON_NO_VIGENTE: 'El cupón todavía no está vigente.',
  CUPON_VENCIDO: 'El cupón venció.',
  CUPON_AGOTADO: 'El cupón se agotó.',
  LIMITE_USUARIO: 'Ya usaste este cupón.',
  TIPO_NO_APLICA: 'Este cupón no se puede usar en esta operación.',
  MONTO_SUPERA_CUPON: 'El monto supera el permitido por el cupón.',
  DEPOSITO_INSUFICIENTE: 'El depósito no alcanza el mínimo del cupón.',
  BONO_ACTIVO: 'Ya tienes un bono activo; termina su rollover antes de usar otro.',
  SALDO_BONO_PENDIENTE:
    'Tienes saldo de una promoción anterior; úsalo en apuestas antes de recibir otro bono.',
  CUENTA_MULTIPLE: 'Este cupón ya se usó desde tu dispositivo o método de pago.',
  USUARIO_EN_REVISION: 'Tu cuenta está en revisión y no puede usar cupones de bono.',
} as const;

export type CodigoMotivo = keyof typeof MOTIVOS;

export interface Motivo {
  readonly codigo: CodigoMotivo;
  readonly mensaje: string;
}

export function motivo(codigo: CodigoMotivo): Motivo {
  return { codigo, mensaje: MOTIVOS[codigo] };
}

/** Un motivo guardado en `canje_cupon.motivo`; `null` si no es un código conocido. */
export function motivoGuardado(codigo: string | null): Motivo | null {
  return codigo !== null && codigo in MOTIVOS ? motivo(codigo as CodigoMotivo) : null;
}

/**
 * `CuponInvalidoError` del contrato 4 con el código del motivo: el Spec 3 lo responde como `CUPON_INVALIDO` con
 * el mensaje legible, y puede leer `codigo` si quiere distinguirlos.
 */
export class CuponRechazadoError extends CuponInvalidoError {
  constructor(readonly codigo: CodigoMotivo) {
    super(MOTIVOS[codigo]);
  }
}
