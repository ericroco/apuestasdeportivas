import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import { ES_PUBLICO, ROLES_REQUERIDOS, type Rol } from '../contracts/autenticacion.js';
import type { SolicitudApi } from './http/cliente-http.js';
import { PERMITE_SIN_SEGUNDO_FACTOR } from './permite-sin-segundo-factor.decorator.js';
import { type AccesoVerificado, TokensService } from './tokens.service.js';

export const COOKIE_ACCESO = 'acceso';

/**
 * Guard global del contrato 1: deniega por defecto. Toda ruta HTTP exige un token de acceso válido salvo
 * `@Publico()`, y `@Roles(...)` exige al menos uno de los roles. Los WebSocket los autentica su gateway con su
 * propio ticket (Spec 3), por eso este guard solo actúa en HTTP.
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  private readonly logger = new Logger(AutenticacionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true;
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;

    const solicitud = contexto.switchToHttp().getRequest<SolicitudApi>();
    const acceso = await this.autenticar(solicitud);

    if (
      acceso.alcance === 'activar-2fa' &&
      !this.reflector.getAllAndOverride<boolean>(PERMITE_SIN_SEGUNDO_FACTOR, objetivos)
    ) {
      throw new ForbiddenException(
        'Activa el segundo factor de autenticación para continuar: es obligatorio para tu rol.',
      );
    }

    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_REQUERIDOS,
      objetivos,
    );
    if (requeridos?.length && !requeridos.some((rol) => acceso.usuario.roles.includes(rol))) {
      await this.auditarDenegacion(solicitud, acceso, requeridos);
      throw new ForbiddenException('No tienes permiso para realizar esta acción.');
    }

    solicitud.user = acceso.usuario;
    solicitud.sesion = { id: acceso.sesionId, alcance: acceso.alcance };
    return true;
  }

  private async autenticar(solicitud: SolicitudApi): Promise<AccesoVerificado> {
    const token = extraerToken(solicitud);
    if (!token) throw new UnauthorizedException('Inicia sesión para continuar.');

    let acceso: AccesoVerificado;
    try {
      acceso = await this.tokens.verificarAcceso(token);
    } catch {
      throw new UnauthorizedException('Tu sesión caducó o no es válida. Vuelve a iniciar sesión.');
    }

    let revocado: boolean;
    try {
      revocado = await this.tokens.estaRevocado(acceso.usuario.id, acceso.emitidoEn);
    } catch (error) {
      // Falla cerrado: sin poder comprobar la revocación no se deja pasar a nadie (principio I).
      this.logger.error(`No se pudo comprobar la revocación: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        'El servicio no está disponible. Inténtalo en unos minutos.',
      );
    }
    if (revocado) {
      throw new UnauthorizedException('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
    }
    return acceso;
  }

  private async auditarDenegacion(
    solicitud: SolicitudApi,
    acceso: AccesoVerificado,
    requeridos: Rol[],
  ): Promise<void> {
    try {
      await this.auditoria.registrar({
        actorId: acceso.usuario.id,
        accion: 'acceso.denegado',
        entidad: 'ruta',
        entidadId: `${solicitud.method} ${solicitud.route?.path ?? solicitud.path}`,
        datos: { rolesRequeridos: requeridos, rolesDelUsuario: acceso.usuario.roles },
        ip: solicitud.cliente?.ip,
        dispositivo: solicitud.cliente?.dispositivo,
      });
    } catch (error) {
      // La denegación se mantiene aunque la auditoría falle; solo se registra en el log.
      this.logger.error(`No se pudo auditar un acceso denegado: ${(error as Error).message}`);
    }
  }
}

function extraerToken(solicitud: SolicitudApi): string | undefined {
  const cookies = solicitud.cookies as Record<string, string> | undefined;
  const deCookie = cookies?.[COOKIE_ACCESO];
  if (deCookie) return deCookie;
  // Llamadas servidor a servidor (contrato 6).
  const [esquema, valor] = (solicitud.header('authorization') ?? '').split(' ');
  return esquema?.toLowerCase() === 'bearer' && valor ? valor : undefined;
}
