import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Pagina } from '../comun/consultas.js';
import { contextoDeAccion } from '../comun/contexto-accion.js';
import { RolesGuard } from '../comun/roles.guard.js';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import type { DetalleCupon, VistaCupon } from './cupon.vista.js';
import {
  esquemaActualizarCupon,
  esquemaCrearCupon,
  esquemaFiltrosCupones,
  esquemaIdCupon,
  type ActualizarCupon,
  type CrearCupon,
  type FiltrosCupones,
} from './cupones.esquemas.js';
import { CuponesService } from './cupones.service.js';

/** Gestión de cupones (HU1): solo operador o administrador (FR-035). */
@Controller('cupones')
@UseGuards(RolesGuard)
@Roles('OPERADOR', 'ADMINISTRADOR')
export class CuponesController {
  constructor(private readonly cupones: CuponesService) {}

  @Post()
  crear(
    @Body({ schema: esquemaCrearCupon }) datos: CrearCupon,
    @UsuarioActual() usuario: UsuarioAutenticado | undefined,
    @Req() peticion: Request,
  ): Promise<VistaCupon> {
    return this.cupones.crear(datos, contextoDeAccion(usuario, peticion));
  }

  @Get()
  listar(
    @Query({ schema: esquemaFiltrosCupones }) filtros: FiltrosCupones,
  ): Promise<Pagina<VistaCupon>> {
    return this.cupones.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', { schema: esquemaIdCupon }) id: string): Promise<DetalleCupon> {
    return this.cupones.obtener(id);
  }

  @Patch(':id')
  actualizar(
    @Param('id', { schema: esquemaIdCupon }) id: string,
    @Body({ schema: esquemaActualizarCupon }) cambios: ActualizarCupon,
    @UsuarioActual() usuario: UsuarioAutenticado | undefined,
    @Req() peticion: Request,
  ): Promise<VistaCupon> {
    return this.cupones.actualizar(id, cambios, contextoDeAccion(usuario, peticion));
  }
}
