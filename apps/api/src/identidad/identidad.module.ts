import { Module } from '@nestjs/common';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AutenticacionGuard } from './autenticacion.guard.js';
import { CaptchaService } from './captcha.service.js';
import { ContrasenasService } from './contrasenas.service.js';
import { crearCorreo } from './correo/adaptadores.js';
import { CORREO_PORT } from './correo/correo.port.js';
import { EnlacesService } from './enlaces.service.js';
import { IdentidadController } from './identidad.controller.js';
import { RecuperacionService } from './recuperacion.service.js';
import { RegistroService } from './registro.service.js';
import { SegundoFactorController } from './segundo-factor.controller.js';
import { SegundoFactorService } from './segundo-factor.service.js';
import { SesionController } from './sesion.controller.js';
import { SesionesService } from './sesiones.service.js';
import { TokensService } from './tokens.service.js';

@Module({
  controllers: [IdentidadController, SesionController, SegundoFactorController],
  providers: [
    TokensService,
    ContrasenasService,
    AutenticacionGuard,
    CaptchaService,
    EnlacesService,
    RegistroService,
    SesionesService,
    RecuperacionService,
    SegundoFactorService,
    {
      provide: CORREO_PORT,
      inject: [ENTORNO],
      useFactory: (entorno: Entorno) => crearCorreo(entorno),
    },
  ],
  exports: [
    TokensService,
    ContrasenasService,
    AutenticacionGuard,
    SesionesService,
    SegundoFactorService,
    CORREO_PORT,
  ],
})
export class IdentidadModule {}
