import { Controller, Get, UseGuards } from '@nestjs/common';
import { usuarioRequerido } from '../comun/contexto-accion.js';
import { RolesGuard } from '../comun/roles.guard.js';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import type { MisBonos } from './bono.vista.js';
import { MisBonosService } from './mis-bonos.service.js';

/** "Mis bonos" (FR-015): cada apostador ve solo los suyos (el usuario sale de la sesión, nunca de la URL). */
@Controller('bonos')
@UseGuards(RolesGuard)
@Roles('APOSTADOR')
export class BonosController {
  constructor(private readonly misBonos: MisBonosService) {}

  @Get('mios')
  mios(@UsuarioActual() usuario: UsuarioAutenticado | undefined): Promise<MisBonos> {
    return this.misBonos.obtener(usuarioRequerido(usuario).id);
  }
}
