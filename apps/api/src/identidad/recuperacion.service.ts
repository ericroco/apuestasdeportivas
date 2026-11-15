import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CaptchaService } from './captcha.service.js';
import { ContrasenasService } from './contrasenas.service.js';
import { CORREO_PORT, type CorreoPort } from './correo/correo.port.js';
import { correoRecuperacion } from './correo/plantillas.js';
import { EnlacesService, hashToken } from './enlaces.service.js';
import type { ClienteHttp } from './http/cliente-http.js';
import { motivoContrasenaInvalida, normalizarEmail } from './politicas.js';
import { SesionesService } from './sesiones.service.js';

const MAX_ENLACES_POR_HORA = 3;
export const MENSAJE_OLVIDO =
  'Si el correo está registrado, te enviamos un enlace para cambiar la contraseña.';
const MENSAJE_ENLACE_INVALIDO =
  'El enlace no es válido, ya se usó o venció. Pide uno nuevo desde "Olvidé mi contraseña".';

/** FR-067: recuperación de contraseña con enlace de un solo uso que cierra todas las sesiones. */
@Injectable()
export class RecuperacionService {
  private readonly logger = new Logger(RecuperacionService.name);

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly prisma: PrismaService,
    private readonly captcha: CaptchaService,
    private readonly contrasenas: ContrasenasService,
    private readonly enlaces: EnlacesService,
    private readonly sesiones: SesionesService,
    @Inject(CORREO_PORT) private readonly correo: CorreoPort,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
  ) {}

  /** Responde lo mismo exista o no el correo (FR-005, FR-067). */
  async solicitar(datos: { email: string; captcha: string }, cliente: ClienteHttp): Promise<void> {
    if (!(await this.captcha.verificar(datos.captcha, cliente.ip))) {
      throw new BadRequestException(
        'No pudimos comprobar que no eres un robot. Vuelve a intentarlo.',
      );
    }
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: normalizarEmail(datos.email) },
    });
    if (!usuario || usuario.estado === 'SUSPENDIDO') return;
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    if (
      (await this.enlaces.contarRecientes(usuario.id, 'RECUPERACION_CONTRASENA', haceUnaHora)) >=
      MAX_ENLACES_POR_HORA
    ) {
      return;
    }
    const token = await this.enlaces.crear(usuario.id, 'RECUPERACION_CONTRASENA');
    const url = `${this.entorno.WEB_ORIGIN}/restablecer?token=${encodeURIComponent(token)}`;
    try {
      await this.correo.enviar(correoRecuperacion(usuario.email, url));
    } catch (error) {
      this.logger.error(`No se pudo enviar el correo de recuperación: ${(error as Error).message}`);
    }
  }

  async restablecer(
    datos: { token: string; contrasena: string },
    cliente: ClienteHttp,
  ): Promise<void> {
    // Se valida la contraseña nueva antes de gastar el enlace, para que el usuario pueda corregirla.
    const enlace = await this.prisma.enlaceCorreo.findUnique({
      where: { hashToken: hashToken(datos.token) },
      include: { usuario: true },
    });
    if (!enlace || enlace.proposito !== 'RECUPERACION_CONTRASENA') {
      throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);
    }
    const motivo = motivoContrasenaInvalida(datos.contrasena, enlace.usuario.email);
    if (motivo) throw new BadRequestException(motivo);
    const hash = await this.contrasenas.hashear(datos.contrasena);

    const usuarioId = await this.prisma.$transaction(async (tx) => {
      const id = await this.enlaces.consumir(datos.token, 'RECUPERACION_CONTRASENA', tx);
      if (!id) return null;
      await tx.credencial.update({
        where: { usuarioId: id },
        data: { hashContrasena: hash, actualizadaEn: new Date() },
      });
      // Quien recupera su contraseña también sale del bloqueo por intentos fallidos.
      await tx.usuario.update({
        where: { id },
        data: { intentosFallidos: 0, bloqueadoHasta: null },
      });
      await this.sesiones.cerrarTodas(id, tx);
      await this.auditoria.registrar(
        {
          actorId: id,
          accion: 'usuario.contrasena_restablecida',
          entidad: 'usuario',
          entidadId: id,
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
      return id;
    });
    if (!usuarioId) throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);
  }
}
