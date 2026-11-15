import { Module } from '@nestjs/common';
import { AutenticacionGuard } from './autenticacion.guard.js';
import { ContrasenasService } from './contrasenas.service.js';
import { TokensService } from './tokens.service.js';

@Module({
  providers: [TokensService, ContrasenasService, AutenticacionGuard],
  exports: [TokensService, ContrasenasService, AutenticacionGuard],
})
export class IdentidadModule {}
