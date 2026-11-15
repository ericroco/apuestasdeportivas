import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import type { Rol } from '../contracts/autenticacion.js';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { Usuario } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CaptchaService } from './captcha.service.js';
import { ContrasenasService } from './contrasenas.service.js';
import type { ClienteHttp } from './http/cliente-http.js';
import { normalizarEmail } from './politicas.js';
import { SegundoFactorService } from './segundo-factor.service.js';
import { type Alcance, TokensService } from './tokens.service.js';

export const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos.';
/** Ventana en la que una renovación repetida se considera de otra pestaña y no un robo (research §3). */
const VENTANA_RENOVACION_MS = 10_000;
const ROLES_CON_2FA_OBLIGATORIO: readonly Rol[] = ['OPERADOR', 'ADMINISTRADOR'];

export interface TokensSesion {
  readonly acceso: string;
  readonly renovacion: string;
}

export type ResultadoInicio =
  | { readonly estado: 'INICIADA'; readonly tokens: TokensSesion }
  | { readonly estado: 'REQUIERE_2FA'; readonly desafio: string };

const hashRenovacion = (token: string): string => createHash('sha256').update(token).digest('hex');

/** HU2: inicio de sesión con bloqueo por intentos, renovación rotativa y cierre (research §3). */
@Injectable()
export class SesionesService {
  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly prisma: PrismaService,
    private readonly contrasenas: ContrasenasService,
    private readonly captcha: CaptchaService,
    private readonly tokens: TokensService,
    private readonly segundoFactor: SegundoFactorService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
  ) {}

  async iniciar(
    datos: { email: string; contrasena: string; captcha: string },
    cliente: ClienteHttp,
  ): Promise<ResultadoInicio> {
    if (!(await this.captcha.verificar(datos.captcha, cliente.ip))) {
      throw new BadRequestException(
        'No pudimos comprobar que no eres un robot. Vuelve a intentarlo.',
      );
    }
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: normalizarEmail(datos.email) },
      include: { credencial: true, segundoFactor: true },
    });
    if (usuario) this.rechazarSiBloqueado(usuario);

    const valida = await this.contrasenas.verificar(
      usuario?.credencial?.hashContrasena ?? null,
      datos.contrasena,
    );
    if (!usuario || !valida) {
      if (usuario) await this.registrarFallo(usuario.id, cliente);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }
    // Después de la contraseña, para no revelar el estado de cuentas ajenas.
    if (usuario.estado === 'SUSPENDIDO') {
      throw new ForbiddenException('Tu cuenta está suspendida. Escribe a soporte para revisarla.');
    }
    await this.prisma.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: 0 } });

    if (usuario.segundoFactor?.activadoEn) {
      return { estado: 'REQUIERE_2FA', desafio: await this.tokens.emitirDesafio2fa(usuario.id) };
    }
    return { estado: 'INICIADA', tokens: await this.abrirSesion(usuario, false, cliente) };
  }

  /** Segundo paso del inicio de sesión con 2FA (cookie `desafio` + código). Los fallos cuentan para el bloqueo. */
  async completarSegundoFactor(
    desafio: string | undefined,
    codigo: string,
    cliente: ClienteHttp,
  ): Promise<TokensSesion> {
    let usuarioId: string;
    try {
      usuarioId = await this.tokens.verificarDesafio2fa(desafio ?? '');
    } catch {
      throw new UnauthorizedException('El paso de verificación venció. Vuelve a iniciar sesión.');
    }
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    this.rechazarSiBloqueado(usuario);
    if (usuario.estado === 'SUSPENDIDO') {
      throw new ForbiddenException('Tu cuenta está suspendida. Escribe a soporte para revisarla.');
    }
    if (!(await this.segundoFactor.verificarCodigo(usuarioId, codigo))) {
      await this.registrarFallo(usuarioId, cliente);
      throw new UnauthorizedException('El código no es correcto o ya se usó.');
    }
    await this.prisma.usuario.update({ where: { id: usuarioId }, data: { intentosFallidos: 0 } });
    return this.abrirSesion(usuario, true, cliente);
  }

  /** Tras activar el 2FA: cierra la sesión limitada actual y abre una completa. */
  async reemplazarSesion(
    sesionId: string,
    usuarioId: string,
    cliente: ClienteHttp,
  ): Promise<TokensSesion> {
    const actual = await this.prisma.sesion.findUnique({ where: { id: sesionId } });
    if (actual?.usuarioId === usuarioId) {
      await this.prisma.sesion.updateMany({
        where: { familiaId: actual.familiaId, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
    }
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    return this.abrirSesion(usuario, true, cliente);
  }

  /** Crea una sesión nueva (familia nueva) y la audita. `con2fa` = el usuario acaba de pasar su segundo factor. */
  async abrirSesion(
    usuario: Usuario,
    con2fa: boolean,
    cliente: ClienteHttp,
  ): Promise<TokensSesion> {
    const tokens = await this.crearSesion(this.prisma, usuario, randomUUID(), con2fa, cliente);
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'sesion.iniciada',
      entidad: 'usuario',
      entidadId: usuario.id,
      datos: { con2fa },
      ip: cliente.ip,
      dispositivo: cliente.dispositivo,
    });
    return tokens;
  }

  async renovar(tokenRenovacion: string | undefined, cliente: ClienteHttp): Promise<TokensSesion> {
    if (!tokenRenovacion) throw new UnauthorizedException('Inicia sesión para continuar.');
    const hash = hashRenovacion(tokenRenovacion);

    const resultado = await this.prisma.$transaction(async (tx) => {
      // Bloqueo de la fila: dos renovaciones simultáneas con la misma credencial se serializan.
      const [sesion] = await tx.$queryRaw<
        {
          id: string;
          usuario_id: string;
          familia_id: string;
          usada_en: Date | null;
          revocada_en: Date | null;
          expira_en: Date;
        }[]
      >`SELECT id, usuario_id, familia_id, usada_en, revocada_en, expira_en FROM sesion WHERE hash_token = ${hash} FOR UPDATE`;
      if (!sesion || sesion.revocada_en || sesion.expira_en <= new Date())
        return { tipo: 'invalida' as const };
      if (sesion.usada_en) {
        if (Date.now() - sesion.usada_en.getTime() < VENTANA_RENOVACION_MS)
          return { tipo: 'en-curso' as const };
        return { tipo: 'reutilizada' as const, usuarioId: sesion.usuario_id };
      }
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: sesion.usuario_id },
        include: { segundoFactor: true },
      });
      if (usuario.estado === 'SUSPENDIDO') return { tipo: 'invalida' as const };
      await tx.sesion.update({ where: { id: sesion.id }, data: { usadaEn: new Date() } });
      const con2fa = Boolean(usuario.segundoFactor?.activadoEn);
      const tokens = await this.crearSesion(tx, usuario, sesion.familia_id, con2fa, cliente);
      return { tipo: 'renovada' as const, tokens };
    });

    switch (resultado.tipo) {
      case 'renovada':
        return resultado.tokens;
      case 'en-curso':
        throw new ConflictException(
          'Tu sesión se está renovando en otra pestaña. Inténtalo de nuevo.',
        );
      case 'reutilizada':
        // Una credencial de renovación usada dos veces indica un robo: se cierran todas las sesiones.
        await this.cerrarTodas(resultado.usuarioId);
        await this.auditoria.registrar({
          actorId: resultado.usuarioId,
          accion: 'sesion.reutilizacion_detectada',
          entidad: 'usuario',
          entidadId: resultado.usuarioId,
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        });
        throw new UnauthorizedException(
          'Por seguridad cerramos tus sesiones. Vuelve a iniciar sesión.',
        );
      default:
        throw new UnauthorizedException('Tu sesión caducó. Vuelve a iniciar sesión.');
    }
  }

  /** Cierra la sesión de este dispositivo: toda su familia de renovaciones (FR-014). */
  async cerrar(sesionId: string, usuarioId: string, cliente: ClienteHttp): Promise<void> {
    const sesion = await this.prisma.sesion.findUnique({ where: { id: sesionId } });
    if (sesion?.usuarioId === usuarioId) {
      await this.prisma.sesion.updateMany({
        where: { familiaId: sesion.familiaId, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
    }
    await this.auditoria.registrar({
      actorId: usuarioId,
      accion: 'sesion.cerrada',
      entidad: 'usuario',
      entidadId: usuarioId,
      ip: cliente.ip,
      dispositivo: cliente.dispositivo,
    });
  }

  /** Revoca todas las sesiones y los accesos ya emitidos (suspensión, contraseña, reutilización, roles). */
  async cerrarTodas(usuarioId: string, tx: ClienteTransaccional = this.prisma): Promise<void> {
    await tx.sesion.updateMany({
      where: { usuarioId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
    await this.tokens.revocarAccesosDe(usuarioId);
  }

  /** Lanza 423 si la cuenta está bloqueada temporalmente (FR-010). */
  rechazarSiBloqueado(usuario: Pick<Usuario, 'bloqueadoHasta'>): void {
    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      const minutos = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `Por seguridad bloqueamos el acceso tras varios intentos fallidos. Inténtalo en ${minutos} min.`,
        HttpStatus.LOCKED,
      );
    }
  }

  /** Cuenta un fallo (contraseña o segundo factor) y bloquea al llegar al límite (FR-010). */
  async registrarFallo(usuarioId: string, cliente: ClienteHttp): Promise<void> {
    const { intentosFallidos } = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { intentosFallidos: { increment: 1 } },
    });
    const auditar = (accion: string) =>
      this.auditoria.registrar({
        actorId: usuarioId,
        accion,
        entidad: 'usuario',
        entidadId: usuarioId,
        datos: { intentosFallidos },
        ip: cliente.ip,
        dispositivo: cliente.dispositivo,
      });
    await auditar('sesion.fallida');
    if (intentosFallidos >= this.entorno.BLOQUEO_INTENTOS) {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: {
          intentosFallidos: 0,
          bloqueadoHasta: new Date(Date.now() + this.entorno.BLOQUEO_MINUTOS * 60_000),
        },
      });
      await auditar('usuario.bloqueado');
    }
  }

  private async crearSesion(
    tx: ClienteTransaccional,
    usuario: Usuario,
    familiaId: string,
    con2fa: boolean,
    cliente: ClienteHttp,
  ): Promise<TokensSesion> {
    const renovacion = randomBytes(32).toString('base64url');
    const sesion = await tx.sesion.create({
      data: {
        usuarioId: usuario.id,
        familiaId,
        hashToken: hashRenovacion(renovacion),
        expiraEn: new Date(Date.now() + this.entorno.JWT_REFRESH_TTL * 1000),
        ip: cliente.ip,
        dispositivo: cliente.dispositivo,
      },
    });
    const acceso = await this.tokens.emitirAcceso({
      usuario: { id: usuario.id, email: usuario.email, roles: usuario.roles },
      sesionId: sesion.id,
      alcance: alcanceDe(usuario.roles, con2fa),
    });
    return { acceso, renovacion };
  }
}

/** Operador y administrador sin 2FA activo solo pueden activarlo (FR-021). */
export function alcanceDe(roles: readonly Rol[], tiene2fa: boolean): Alcance {
  return !tiene2fa && roles.some((rol) => ROLES_CON_2FA_OBLIGATORIO.includes(rol))
    ? 'activar-2fa'
    : 'completo';
}
