import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { UsuarioAutenticado } from '../contracts/autenticacion.js';

export const LIMITE_VISTA_PREVIA = 10;
export const VENTANA_VISTA_PREVIA_MS = 60_000;

/**
 * Límite de la vista previa por USUARIO (no por IP): 10 consultas por minuto, contra la enumeración de códigos.
 * Va después de `RolesGuard`, cuando ya hay `request.user`. Usa el almacén de `@nestjs/throttler`; el límite global
 * por IP sigue aplicando.
 */
@Injectable()
export class LimiteVistaPreviaGuard implements CanActivate {
  constructor(@InjectThrottlerStorage() private readonly almacen: ThrottlerStorage) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const usuario = contexto.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>().user;
    if (!usuario) throw new UnauthorizedException('Inicia sesión para continuar.');
    const { isBlocked } = await this.almacen.increment(
      `vista-previa:${usuario.id}`,
      VENTANA_VISTA_PREVIA_MS,
      LIMITE_VISTA_PREVIA,
      VENTANA_VISTA_PREVIA_MS,
      'vista-previa',
    );
    if (isBlocked) {
      throw new ThrottlerException(
        'Consultaste demasiados cupones. Espera un minuto e intenta de nuevo.',
      );
    }
    return true;
  }
}
