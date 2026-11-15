import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Publico, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import { esquemaRegistro, esquemaToken } from './esquemas.js';
import { ClienteActual, type ClienteHttp } from './http/cliente-http.js';
import { PermiteSinSegundoFactor } from './permite-sin-segundo-factor.decorator.js';
import { type DatosRegistro, MENSAJE_REGISTRO, RegistroService } from './registro.service.js';

/** Límite estricto de las rutas públicas de identidad: 5 por minuto e IP (contracts/api-rest.md). */
export const LIMITE_PUBLICO = { default: { limit: 5, ttl: 60_000 } };

@Controller('identidad')
export class IdentidadController {
  constructor(private readonly registro: RegistroService) {}

  @Post('registro')
  @Publico()
  @Throttle(LIMITE_PUBLICO)
  @HttpCode(HttpStatus.ACCEPTED)
  async registrar(
    @Body({ schema: esquemaRegistro }) datos: DatosRegistro,
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<{ mensaje: string }> {
    await this.registro.registrar(datos, cliente);
    return { mensaje: MENSAJE_REGISTRO };
  }

  @Post('correo/verificar')
  @Publico()
  @Throttle(LIMITE_PUBLICO)
  @HttpCode(HttpStatus.OK)
  async verificarCorreo(
    @Body({ schema: esquemaToken }) { token }: { token: string },
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<{ verificado: true }> {
    await this.registro.verificarCorreo(token, cliente);
    return { verificado: true };
  }

  @Post('correo/reenviar')
  @PermiteSinSegundoFactor()
  @HttpCode(HttpStatus.ACCEPTED)
  async reenviar(@UsuarioActual() usuario: UsuarioAutenticado): Promise<{ mensaje: string }> {
    await this.registro.reenviarVerificacion(usuario.id);
    return { mensaje: 'Si tu correo aún no está confirmado, te enviamos un enlace nuevo.' };
  }
}
