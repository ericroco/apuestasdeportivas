/**
 * Contrato de autenticación y autorización.
 * Provee: Spec 2 (Ricardo), que implementa el guard global de JWT + RBAC y llena `request.user`.
 * Consumen: todos los controladores de los specs 2, 3 y 4.
 *
 * Reglas del contrato (docs/equipo/contratos.md §1):
 * - El guard global deniega por defecto: toda ruta exige un usuario autenticado salvo `@Publico()`.
 * - `@Roles(...)` exige al menos uno de los roles indicados; sin `@Roles`, basta estar autenticado.
 * - El guard deja en `request.user` un `UsuarioAutenticado`; `@UsuarioActual()` lo lee.
 */
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

export const ROLES = ['APOSTADOR', 'OPERADOR', 'ADMINISTRADOR'] as const;

export type Rol = (typeof ROLES)[number];

export interface UsuarioAutenticado {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly Rol[];
}

/** Clave de metadatos que el guard del Spec 2 lee para saltarse la autenticación. */
export const ES_PUBLICO = 'esPublico';

/** Clave de metadatos con los roles requeridos por una ruta. */
export const ROLES_REQUERIDOS = 'rolesRequeridos';

/** Marca una ruta como pública (sin autenticación). Úsalo solo en salud, login, registro y webhooks firmados. */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(ES_PUBLICO, true);

/** Restringe una ruta a los roles indicados. */
export const Roles = (...roles: Rol[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_REQUERIDOS, roles);

/** Inyecta el usuario autenticado que dejó el guard en `request.user`. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado | undefined =>
    contexto.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>().user,
);
