import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import type { Rol } from '../contracts/autenticacion.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ClienteHttp } from './http/cliente-http.js';

const EMISOR_TOTP = 'Apuestas UTPL';
const PERIODO_S = 30;
const CODIGOS_RECUPERACION = 10;
/** Sin 0/O ni 1/I/L, para que se puedan copiar a mano. */
const ALFABETO_RECUPERACION = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const hash = (valor: string): string => createHash('sha256').update(valor).digest('hex');

/** HU6: TOTP con secreto cifrado (AES-256-GCM), un solo uso por periodo y códigos de recuperación (research §5). */
@Injectable()
export class SegundoFactorService {
  private readonly clave: Buffer;

  constructor(
    @Inject(ENTORNO) entorno: Entorno,
    private readonly prisma: PrismaService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
  ) {
    this.clave = Buffer.from(entorno.TOTP_CLAVE_CIFRADO, 'base64');
  }

  /** Genera un secreto pendiente; no protege nada hasta confirmarlo con un código (FR-017). */
  async iniciarActivacion(
    usuarioId: string,
    email: string,
  ): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
    const actual = await this.prisma.segundoFactor.findUnique({ where: { usuarioId } });
    if (actual?.activadoEn) {
      throw new ConflictException('Ya tienes activado el segundo factor.');
    }
    const secreto = new OTPAuth.Secret({ size: 20 });
    await this.prisma.segundoFactor.upsert({
      where: { usuarioId },
      create: { usuarioId, secretoCifrado: this.cifrar(secreto.base32) },
      update: { secretoCifrado: this.cifrar(secreto.base32), ultimoPasoUsado: null },
    });
    const otpauthUrl = this.totp(secreto.base32, email).toString();
    return { otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl) };
  }

  /** Activa el 2FA si el código es válido y devuelve los códigos de recuperación (se muestran una sola vez). */
  async confirmarActivacion(
    usuarioId: string,
    email: string,
    codigo: string,
    cliente: ClienteHttp,
  ): Promise<string[]> {
    const pendiente = await this.prisma.segundoFactor.findUnique({ where: { usuarioId } });
    if (!pendiente)
      throw new NotFoundException('Primero genera el código QR para activar el segundo factor.');
    if (pendiente.activadoEn) throw new ConflictException('Ya tienes activado el segundo factor.');
    if (!(await this.consumirTotp(usuarioId, codigo, email))) {
      throw new BadRequestException(
        'El código no es correcto. Revisa la hora de tu teléfono y vuelve a intentarlo.',
      );
    }

    const codigos = Array.from({ length: CODIGOS_RECUPERACION }, () =>
      Array.from(
        { length: 10 },
        () => ALFABETO_RECUPERACION[randomInt(ALFABETO_RECUPERACION.length)],
      ).join(''),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.segundoFactor.update({ where: { usuarioId }, data: { activadoEn: new Date() } });
      await tx.codigoRecuperacion.deleteMany({ where: { usuarioId } });
      await tx.codigoRecuperacion.createMany({
        data: codigos.map((c) => ({ usuarioId, hashCodigo: hash(c) })),
      });
      await this.auditoria.registrar(
        {
          actorId: usuarioId,
          accion: 'segundo_factor.activado',
          entidad: 'usuario',
          entidadId: usuarioId,
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
    });
    return codigos;
  }

  /**
   * Comprueba un código de un 2FA activo: TOTP de 6 dígitos (una sola vez por periodo) o un código de
   * recuperación de 10 caracteres (un solo uso). Lo usan el inicio de sesión, los retiros y el panel de admin.
   */
  async verificarCodigo(usuarioId: string, codigo: string): Promise<boolean> {
    const factor = await this.prisma.segundoFactor.findUnique({
      where: { usuarioId },
      include: { usuario: true },
    });
    if (!factor?.activadoEn) return false;
    if (/^\d{6}$/.test(codigo)) return this.consumirTotp(usuarioId, codigo, factor.usuario.email);
    const { count } = await this.prisma.codigoRecuperacion.updateMany({
      where: { usuarioId, hashCodigo: hash(codigo.toUpperCase()), usadoEn: null },
      data: { usadoEn: new Date() },
    });
    return count === 1;
  }

  async tieneActivo(usuarioId: string): Promise<boolean> {
    const factor = await this.prisma.segundoFactor.findUnique({ where: { usuarioId } });
    return Boolean(factor?.activadoEn);
  }

  async desactivar(
    usuarioId: string,
    roles: readonly Rol[],
    codigo: string,
    cliente: ClienteHttp,
  ): Promise<void> {
    if (roles.some((rol) => rol === 'OPERADOR' || rol === 'ADMINISTRADOR')) {
      throw new ForbiddenException(
        'El segundo factor es obligatorio para tu rol y no se puede desactivar.',
      );
    }
    if (!(await this.verificarCodigo(usuarioId, codigo))) {
      throw new BadRequestException('El código no es correcto.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.codigoRecuperacion.deleteMany({ where: { usuarioId } });
      await tx.segundoFactor.delete({ where: { usuarioId } });
      await this.auditoria.registrar(
        {
          actorId: usuarioId,
          accion: 'segundo_factor.desactivado',
          entidad: 'usuario',
          entidadId: usuarioId,
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
    });
  }

  /** Acepta ±1 periodo (FR-019) y marca el periodo como usado con un UPDATE condicional: un código, un uso. */
  private async consumirTotp(usuarioId: string, codigo: string, email: string): Promise<boolean> {
    const factor = await this.prisma.segundoFactor.findUnique({ where: { usuarioId } });
    if (!factor) return false;
    const delta = this.totp(this.descifrar(factor.secretoCifrado), email).validate({
      token: codigo,
      window: 1,
    });
    if (delta === null) return false;
    const paso = BigInt(Math.floor(Date.now() / 1000 / PERIODO_S) + delta);
    const { count } = await this.prisma.segundoFactor.updateMany({
      where: {
        usuarioId,
        OR: [{ ultimoPasoUsado: null }, { ultimoPasoUsado: { lt: paso } }],
      },
      data: { ultimoPasoUsado: paso },
    });
    return count === 1;
  }

  private totp(secretoBase32: string, email: string): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer: EMISOR_TOTP,
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: PERIODO_S,
      secret: OTPAuth.Secret.fromBase32(secretoBase32),
    });
  }

  private cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', this.clave, iv);
    const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
    return [iv, cifrador.getAuthTag(), cifrado].map((b) => b.toString('base64')).join('.');
  }

  private descifrar(guardado: string): string {
    const [iv = '', etiqueta = '', cifrado = ''] = guardado.split('.');
    const descifrador = createDecipheriv('aes-256-gcm', this.clave, Buffer.from(iv, 'base64'));
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64'));
    return Buffer.concat([
      descifrador.update(Buffer.from(cifrado, 'base64')),
      descifrador.final(),
    ]).toString('utf8');
  }
}
