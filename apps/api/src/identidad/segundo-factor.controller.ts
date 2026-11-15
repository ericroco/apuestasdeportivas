import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ENTORNO, type Entorno } from '../config/env.js';
import { Publico, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import { COOKIE_DESAFIO, ponerCookiesSesion } from './cookies.js';
import { esquemaCodigo } from './esquemas.js';
import { ClienteActual, type ClienteHttp, type SolicitudApi } from './http/cliente-http.js';
import { LIMITE_PUBLICO } from './identidad.controller.js';
import { PermiteSinSegundoFactor } from './permite-sin-segundo-factor.decorator.js';
import { SegundoFactorService } from './segundo-factor.service.js';
import { SesionesService } from './sesiones.service.js';

/** HU6: rutas del segundo factor (contracts/api-rest.md). */
@Controller('identidad')
export class SegundoFactorController {
  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly segundoFactor: SegundoFactorService,
    private readonly sesiones: SesionesService,
  ) {}

  @Post('sesion/2fa')
  @Publico()
  @Throttle(LIMITE_PUBLICO)
  @HttpCode(HttpStatus.OK)
  async completarInicio(
    @Body({ schema: esquemaCodigo }) { codigo }: { codigo: string },
    @Req() solicitud: SolicitudApi,
    @ClienteActual() cliente: ClienteHttp,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ estado: 'INICIADA' }> {
    const cookies = solicitud.cookies as Record<string, string> | undefined;
    const tokens = await this.sesiones.completarSegundoFactor(
      cookies?.[COOKIE_DESAFIO],
      codigo,
      cliente,
    );
    ponerCookiesSesion(respuesta, this.entorno, tokens);
    return { estado: 'INICIADA' };
  }

  @Post('2fa/activacion')
  @PermiteSinSegundoFactor()
  iniciarActivacion(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
    return this.segundoFactor.iniciarActivacion(usuario.id, usuario.email);
  }

  /** Activa el 2FA y entrega una sesión completa (el operador sin 2FA deja de estar limitado). */
  @Post('2fa/activacion/confirmar')
  @PermiteSinSegundoFactor()
  @HttpCode(HttpStatus.OK)
  async confirmarActivacion(
    @Body({ schema: esquemaCodigo }) { codigo }: { codigo: string },
    @Req() solicitud: SolicitudApi,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ codigosRecuperacion: string[] }> {
    const codigosRecuperacion = await this.segundoFactor.confirmarActivacion(
      usuario.id,
      usuario.email,
      codigo,
      cliente,
    );
    const tokens = await this.sesiones.reemplazarSesion(
      solicitud.sesion?.id ?? '',
      usuario.id,
      cliente,
    );
    ponerCookiesSesion(respuesta, this.entorno, tokens);
    return { codigosRecuperacion };
  }

  @Post('2fa/desactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desactivar(
    @Body({ schema: esquemaCodigo }) { codigo }: { codigo: string },
    @UsuarioActual() usuario: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<void> {
    await this.segundoFactor.desactivar(usuario.id, usuario.roles, codigo, cliente);
  }
}
