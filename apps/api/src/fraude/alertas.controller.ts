import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Pagina } from '../comun/consultas.js';
import { contextoDeAccion } from '../comun/contexto-accion.js';
import { RolesGuard } from '../comun/roles.guard.js';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import {
  esquemaFiltrosAlertas,
  esquemaIdAlerta,
  esquemaResolverAlerta,
  type FiltrosAlertas,
  type ResolverAlerta,
} from './alertas.esquemas.js';
import { AlertasService } from './alertas.service.js';
import type { VistaAlerta } from './alertas.vista.js';

/** Alertas de fraude (HU4): solo el administrador (FR-035). */
@Controller('alertas')
@UseGuards(RolesGuard)
@Roles('ADMINISTRADOR')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  listar(
    @Query({ schema: esquemaFiltrosAlertas }) filtros: FiltrosAlertas,
  ): Promise<Pagina<VistaAlerta>> {
    return this.alertas.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', { schema: esquemaIdAlerta }) id: string): Promise<VistaAlerta> {
    return this.alertas.obtener(id);
  }

  @Post(':id/resolucion')
  @HttpCode(200)
  resolver(
    @Param('id', { schema: esquemaIdAlerta }) id: string,
    @Body({ schema: esquemaResolverAlerta }) datos: ResolverAlerta,
    @UsuarioActual() usuario: UsuarioAutenticado | undefined,
    @Req() peticion: Request,
  ): Promise<VistaAlerta> {
    return this.alertas.resolver(id, datos, contextoDeAccion(usuario, peticion));
  }
}
