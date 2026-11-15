import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ENTORNO, type Entorno } from '../config/env.js';
import { Publico, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  borrarCookiesSesion,
  COOKIE_RENOVACION,
  ponerCookieDesafio,
  ponerCookiesSesion,
} from './cookies.js';
import {
  type DatosInicioSesion,
  esquemaInicioSesion,
  esquemaOlvido,
  esquemaRestablecer,
} from './esquemas.js';
import { ClienteActual, type ClienteHttp, type SolicitudApi } from './http/cliente-http.js';
import { LIMITE_PUBLICO } from './identidad.controller.js';
import { PermiteSinSegundoFactor } from './permite-sin-segundo-factor.decorator.js';
import { MENSAJE_OLVIDO, RecuperacionService } from './recuperacion.service.js';
import { SesionesService } from './sesiones.service.js';

export interface PerfilPropio {
  readonly id: string;
  readonly email: string;
  readonly nombreCompleto: string;
  readonly roles: readonly string[];
  readonly verificado: boolean;
  readonly tiene2fa: boolean;
  readonly alcance: string;
}

@Controller('identidad')
export class SesionController {
  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly sesiones: SesionesService,
    private readonly recuperacion: RecuperacionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('sesion')
  @Publico()
  @Throttle(LIMITE_PUBLICO)
  @HttpCode(HttpStatus.OK)
  async iniciar(
    @Body({ schema: esquemaInicioSesion }) datos: DatosInicioSesion,
    @ClienteActual() cliente: ClienteHttp,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ estado: 'INICIADA' | 'REQUIERE_2FA' }> {
    const resultado = await this.sesiones.iniciar(datos, cliente);
    if (resultado.estado === 'REQUIERE_2FA') {
      ponerCookieDesafio(respuesta, this.entorno, resultado.desafio);
    } else {
      ponerCookiesSesion(respuesta, this.entorno, resultado.tokens);
    }
    return { estado: resultado.estado };
  }

  @Post('sesion/renovar')
  @Publico()
  @HttpCode(HttpStatus.NO_CONTENT)
  async renovar(
    @Req() solicitud: SolicitudApi,
    @ClienteActual() cliente: ClienteHttp,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    const cookies = solicitud.cookies as Record<string, string> | undefined;
    const tokens = await this.sesiones.renovar(cookies?.[COOKIE_RENOVACION], cliente);
    ponerCookiesSesion(respuesta, this.entorno, tokens);
  }

  @Post('sesion/cerrar')
  @PermiteSinSegundoFactor()
  @HttpCode(HttpStatus.NO_CONTENT)
  async cerrar(
    @Req() solicitud: SolicitudApi,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    if (solicitud.sesion) await this.sesiones.cerrar(solicitud.sesion.id, usuario.id, cliente);
    borrarCookiesSesion(respuesta, this.entorno);
  }

  @Get('yo')
  @PermiteSinSegundoFactor()
  async yo(
    @Req() solicitud: SolicitudApi,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PerfilPropio> {
    const datos = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      include: { segundoFactor: true },
    });
    return {
      id: datos.id,
      email: datos.email,
      nombreCompleto: datos.nombreCompleto,
      roles: datos.roles,
      verificado: datos.correoVerificadoEn !== null,
      tiene2fa: Boolean(datos.segundoFactor?.activadoEn),
      alcance: solicitud.sesion?.alcance ?? 'completo',
    };
  }

  @Post('contrasena/olvido')
  @Publico()
  @Throttle(LIMITE_PUBLICO)
  @HttpCode(HttpStatus.ACCEPTED)
  async olvido(
    @Body({ schema: esquemaOlvido }) datos: { email: string; captcha: string },
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<{ mensaje: string }> {
    await this.recuperacion.solicitar(datos, cliente);
    return { mensaje: MENSAJE_OLVIDO };
  }

  @Post('contrasena/restablecer')
  @Publico()
  @Throttle(LIMITE_PUBLICO)
  @HttpCode(HttpStatus.NO_CONTENT)
  async restablecer(
    @Body({ schema: esquemaRestablecer }) datos: { token: string; contrasena: string },
    @ClienteActual() cliente: ClienteHttp,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    await this.recuperacion.restablecer(datos, cliente);
    borrarCookiesSesion(respuesta, this.entorno);
  }
}
