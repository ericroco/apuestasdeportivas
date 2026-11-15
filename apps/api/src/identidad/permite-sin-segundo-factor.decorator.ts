import { SetMetadata } from '@nestjs/common';

export const PERMITE_SIN_SEGUNDO_FACTOR = 'permiteSinSegundoFactor';

/**
 * Ruta permitida a un operador o administrador que todavía no activó el 2FA (alcance `activar-2fa`, FR-021):
 * solo activar el 2FA, ver `yo` y cerrar sesión.
 */
export const PermiteSinSegundoFactor = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMITE_SIN_SEGUNDO_FACTOR, true);
