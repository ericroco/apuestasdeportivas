import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import { EVENTOS, type UsuarioRegistrado } from '../contracts/eventos.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CaptchaService } from './captcha.service.js';
import { ContrasenasService } from './contrasenas.service.js';
import { CORREO_PORT, type CorreoPort } from './correo/correo.port.js';
import { correoCuentaExistente, correoVerificacion } from './correo/plantillas.js';
import { EnlacesService } from './enlaces.service.js';
import type { ClienteHttp } from './http/cliente-http.js';
import { esMayorDeEdad, motivoContrasenaInvalida, normalizarEmail } from './politicas.js';

export interface DatosRegistro {
  readonly nombreCompleto: string;
  readonly email: string;
  readonly contrasena: string;
  readonly fechaNacimiento: string;
  readonly declaraMayorEdad: true;
  readonly captcha: string;
}

/** Igual exista o no el correo (FR-005). */
export const MENSAJE_REGISTRO =
  'Si los datos son correctos, te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja de entrada.';

const MAX_REENVIOS_POR_HORA = 3;

/** HU1: registro con mayoría de edad, CAPTCHA y verificación de correo. */
@Injectable()
export class RegistroService {
  private readonly logger = new Logger(RegistroService.name);

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly prisma: PrismaService,
    private readonly contrasenas: ContrasenasService,
    private readonly captcha: CaptchaService,
    private readonly enlaces: EnlacesService,
    @Inject(CORREO_PORT) private readonly correo: CorreoPort,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
    private readonly eventos: EventEmitter2,
  ) {}

  async registrar(datos: DatosRegistro, cliente: ClienteHttp): Promise<void> {
    if (!(await this.captcha.verificar(datos.captcha, cliente.ip))) {
      throw new BadRequestException(
        'No pudimos comprobar que no eres un robot. Vuelve a intentarlo.',
      );
    }
    const fechaNacimiento = new Date(`${datos.fechaNacimiento}T00:00:00Z`);
    if (!esMayorDeEdad(fechaNacimiento, new Date())) {
      throw new BadRequestException('Debes ser mayor de 18 años para crear una cuenta.');
    }
    const email = normalizarEmail(datos.email);
    const motivo = motivoContrasenaInvalida(datos.contrasena, email);
    if (motivo) throw new BadRequestException(motivo);

    const existente = await this.prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      await this.avisarCuentaExistente(email);
      return;
    }

    const hash = await this.contrasenas.hashear(datos.contrasena);
    let creado: { usuarioId: string; token: string };
    try {
      creado = await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            email,
            nombreCompleto: datos.nombreCompleto,
            fechaNacimiento,
            credencial: { create: { hashContrasena: hash } },
          },
        });
        const token = await this.enlaces.crear(usuario.id, 'VERIFICACION_CORREO', tx);
        await this.auditoria.registrar(
          {
            actorId: usuario.id,
            accion: 'usuario.registrado',
            entidad: 'usuario',
            entidadId: usuario.id,
            ip: cliente.ip,
            dispositivo: cliente.dispositivo,
          },
          tx,
        );
        return { usuarioId: usuario.id, token };
      });
    } catch (error) {
      // Dos registros simultáneos con el mismo correo: el segundo responde igual que si existiera.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this.avisarCuentaExistente(email);
        return;
      }
      throw error;
    }

    // Tras el commit (contrato 5).
    await this.enviarSinFallar(
      correoVerificacion(email, datos.nombreCompleto, this.urlVerificacion(creado.token)),
    );
    const evento: UsuarioRegistrado = {
      usuarioId: creado.usuarioId,
      ip: cliente.ip,
      dispositivo: cliente.dispositivo,
    };
    this.eventos.emit(EVENTOS.usuarioRegistrado, evento);
  }

  async verificarCorreo(token: string, cliente: ClienteHttp): Promise<void> {
    const verificado = await this.prisma.$transaction(async (tx) => {
      const usuarioId = await this.enlaces.consumir(token, 'VERIFICACION_CORREO', tx);
      if (!usuarioId) return false;
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          correoVerificadoEn: usuario.correoVerificadoEn ?? new Date(),
          // Una cuenta suspendida sigue suspendida aunque verifique su correo.
          ...(usuario.estado === 'PENDIENTE_VERIFICACION' ? { estado: 'ACTIVO' as const } : {}),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: usuarioId,
          accion: 'usuario.correo_verificado',
          entidad: 'usuario',
          entidadId: usuarioId,
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
      return true;
    });
    if (!verificado) {
      throw new BadRequestException(
        'El enlace no es válido, ya se usó o venció. Inicia sesión y pide uno nuevo.',
      );
    }
  }

  async reenviarVerificacion(usuarioId: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || usuario.correoVerificadoEn) return;
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    const recientes = await this.enlaces.contarRecientes(
      usuarioId,
      'VERIFICACION_CORREO',
      haceUnaHora,
    );
    if (recientes >= MAX_REENVIOS_POR_HORA) {
      throw new HttpException(
        'Ya te enviamos varios correos en la última hora. Revisa tu bandeja o inténtalo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const token = await this.enlaces.crear(usuarioId, 'VERIFICACION_CORREO');
    await this.enviarSinFallar(
      correoVerificacion(usuario.email, usuario.nombreCompleto, this.urlVerificacion(token)),
    );
  }

  private urlVerificacion(token: string): string {
    return `${this.entorno.WEB_ORIGIN}/verificar-correo?token=${encodeURIComponent(token)}`;
  }

  private async avisarCuentaExistente(email: string): Promise<void> {
    await this.enviarSinFallar(
      correoCuentaExistente(email, `${this.entorno.WEB_ORIGIN}/iniciar-sesion`),
    );
  }

  /** Un correo que no sale no deshace el registro: el usuario puede pedir otro enlace. */
  private async enviarSinFallar(correo: Parameters<CorreoPort['enviar']>[0]): Promise<void> {
    try {
      await this.correo.enviar(correo);
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo "${correo.asunto}": ${(error as Error).message}`,
      );
    }
  }
}
