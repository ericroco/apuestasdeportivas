import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ES_PUBLICO,
  ROLES,
  ROLES_REQUERIDOS,
  type Rol,
  type UsuarioAutenticado,
} from '../../src/contracts/index.js';

/** Cabecera con la que las pruebas e2e eligen el usuario: `<id>` o `<id>;<ROL>,<ROL>` (por defecto APOSTADOR). */
export const CABECERA_USUARIO_PRUEBA = 'x-usuario-prueba';

/** Valor de la cabecera para un usuario de prueba. */
export function comoUsuario(id: string, ...roles: Rol[]): Record<string, string> {
  return { [CABECERA_USUARIO_PRUEBA]: roles.length ? `${id};${roles.join(',')}` : id };
}

/**
 * Guard de las pruebas e2e (contratos.md §1) que reproduce el contrato del guard global del Spec 2:
 * deniega por defecto (401 sin usuario) salvo `@Publico()`, aplica `@Roles(...)` (403) y deja el usuario en
 * `request.user`. Solo existe en test/: nunca se registra en la aplicación real.
 */
@Injectable()
export class GuardPrueba implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;

    const solicitud = contexto.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: UsuarioAutenticado;
    }>();
    const usuario = leerUsuario(solicitud.headers[CABECERA_USUARIO_PRUEBA]);
    if (!usuario) throw new UnauthorizedException('Inicia sesión para continuar');
    solicitud.user = usuario;

    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_REQUERIDOS,
      objetivos,
    );
    if (requeridos?.length && !requeridos.some((rol) => usuario.roles.includes(rol))) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    return true;
  }
}

function leerUsuario(cabecera: string | string[] | undefined): UsuarioAutenticado | null {
  if (typeof cabecera !== 'string' || cabecera.trim() === '') return null;
  const [id = '', rolesTexto] = cabecera.split(';');
  const roles = (rolesTexto ? rolesTexto.split(',') : ['APOSTADOR']).filter((rol): rol is Rol =>
    (ROLES as readonly string[]).includes(rol),
  );
  return { id: id.trim(), email: `${id.trim()}@prueba.local`, roles };
}
