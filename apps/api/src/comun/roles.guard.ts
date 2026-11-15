import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ROLES,
  ROLES_REQUERIDOS,
  type Rol,
  type UsuarioAutenticado,
} from '../contracts/autenticacion.js';

function esUsuarioAutenticado(usuario: unknown): usuario is UsuarioAutenticado {
  if (typeof usuario !== 'object' || usuario === null) return false;
  const { id, roles } = usuario as Partial<Record<keyof UsuarioAutenticado, unknown>>;
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    Array.isArray(roles) &&
    roles.every((rol) => ROLES.includes(rol as Rol))
  );
}

/**
 * Guard local del Spec 4 (defensa en profundidad sobre el guard global del Spec 2, contrato 1).
 * Falla cerrada: sin `request.user` responde 401 aunque el guard global todavía no exista; con `@Roles(...)`
 * exige al menos uno de esos roles (403).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const usuario = contexto.switchToHttp().getRequest<{ user?: unknown }>().user;
    if (!esUsuarioAutenticado(usuario)) {
      throw new UnauthorizedException('Inicia sesión para continuar.');
    }
    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_REQUERIDOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (requeridos?.length && !requeridos.some((rol) => usuario.roles.includes(rol))) {
      throw new ForbiddenException('No tienes permiso para esta acción.');
    }
    return true;
  }
}
