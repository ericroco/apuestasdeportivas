import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioAutenticado } from '../contracts/autenticacion.js';

/** Largo máximo del user-agent que se guarda como dispositivo en la auditoría. */
const MAX_DISPOSITIVO = 200;

/** Quién hace la acción y desde dónde, para la auditoría (constitución, principio I). */
export interface ContextoAccion {
  readonly actorId: string;
  readonly ip?: string;
  readonly dispositivo?: string;
}

export function contextoDeAccion(
  usuario: UsuarioAutenticado | undefined,
  peticion: Request,
): ContextoAccion {
  return {
    actorId: usuarioRequerido(usuario).id,
    ip: peticion.ip,
    dispositivo: peticion.get('user-agent')?.slice(0, MAX_DISPOSITIVO),
  };
}

/** El `RolesGuard` ya exige usuario; esto evita depender de ello si alguien quita el guard (falla cerrada). */
export function usuarioRequerido(usuario: UsuarioAutenticado | undefined): UsuarioAutenticado {
  if (!usuario) throw new UnauthorizedException('Inicia sesión para continuar.');
  return usuario;
}
