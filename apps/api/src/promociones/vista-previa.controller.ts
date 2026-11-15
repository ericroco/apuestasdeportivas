import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { usuarioRequerido } from '../comun/contexto-accion.js';
import { RolesGuard } from '../comun/roles.guard.js';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import { LimiteVistaPreviaGuard } from './limite-vista-previa.guard.js';
import { VistaPreviaService, type VistaPreviaCupon } from './vista-previa.service.js';

const esquemaCodigo = z.string().min(1).max(40);

/** Vista previa de un cupón para el apostador (FR-009), limitada a 10 consultas por minuto por usuario. */
@Controller('cupones/vista-previa')
@UseGuards(RolesGuard, LimiteVistaPreviaGuard)
@Roles('APOSTADOR')
export class VistaPreviaController {
  constructor(private readonly vistaPrevia: VistaPreviaService) {}

  @Get(':codigo')
  previsualizar(
    @Param('codigo', { schema: esquemaCodigo }) codigo: string,
    @UsuarioActual() usuario: UsuarioAutenticado | undefined,
  ): Promise<VistaPreviaCupon> {
    return this.vistaPrevia.previsualizar(usuarioRequerido(usuario).id, codigo);
  }
}
