import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ROLES, type Rol, type UsuarioAutenticado } from '../../src/contracts/autenticacion.js';

export const CABECERA_USUARIO = 'x-usuario-prueba-id';
export const CABECERA_ROLES = 'x-usuario-prueba-roles';

interface PeticionDePrueba {
  headers: Record<string, string | string[] | undefined>;
  user?: UsuarioAutenticado;
}

/** Cabeceras que el guard de prueba convierte en `request.user`. */
export function comoUsuario(id: string, ...roles: Rol[]): Record<string, string> {
  return { [CABECERA_USUARIO]: id, [CABECERA_ROLES]: roles.join(',') };
}

/**
 * Reemplaza en las pruebas al guard global del Spec 2 (contrato 1): fija `request.user` desde las cabeceras de
 * prueba. Sin cabeceras no fija nada, y el `RolesGuard` del Spec 4 debe responder 401.
 */
@Injectable()
export class GuardDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<PeticionDePrueba>();
    const id = peticion.headers[CABECERA_USUARIO];
    if (typeof id !== 'string' || id.length === 0) return true;
    const roles = String(peticion.headers[CABECERA_ROLES] ?? '')
      .split(',')
      .filter((rol): rol is Rol => ROLES.includes(rol as Rol));
    peticion.user = { id, email: `${id}@prueba.local`, roles };
    return true;
  }
}
