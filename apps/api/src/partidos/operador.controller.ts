import type { CompeticionDto, PartidoDetalleDto } from '@apuestas/shared';
import { Body, Controller, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { type ContextoOperacion, ContextoOperador } from '../comun/contexto-operacion.js';
import { Roles } from '../contracts/index.js';
import { MercadosService } from './mercados.service.js';
import {
  type CambioCuota,
  cambioCuotaEsquema,
  type CambioEstado,
  cambioEstadoEsquema,
  type ConMotivo,
  type CrearCompeticion,
  crearCompeticionEsquema,
  type CrearMercado,
  crearMercadoEsquema,
  type CrearPartido,
  crearPartidoEsquema,
  type EditarPartido,
  editarPartidoEsquema,
  idParam,
  type Marcador,
  marcadorEsquema,
  motivoEsquema,
  type Resultado,
  resultadoEsquema,
} from './partidos.esquemas.js';
import { PartidosService } from './partidos.service.js';

/**
 * Gestión de partidos, mercados y cuotas: solo OPERADOR o ADMINISTRADOR (FR-039).
 * No hay rutas DELETE: un partido o mercado no se borra, se cancela (FR-007).
 */
@Controller('operador')
@Roles('OPERADOR', 'ADMINISTRADOR')
export class OperadorController {
  constructor(
    private readonly partidos: PartidosService,
    private readonly mercados: MercadosService,
  ) {}

  @Post('competiciones')
  crearCompeticion(
    @Body({ schema: crearCompeticionEsquema }) datos: CrearCompeticion,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<CompeticionDto> {
    return this.partidos.crearCompeticion(datos, contexto);
  }

  @Post('partidos')
  crearPartido(
    @Body({ schema: crearPartidoEsquema }) datos: CrearPartido,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.partidos.crearPartido(datos, contexto);
  }

  @Patch('partidos/:id')
  editarPartido(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: editarPartidoEsquema }) datos: EditarPartido,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.partidos.editarPartido(id, datos, contexto);
  }

  @Post('partidos/:id/estado')
  @HttpCode(200)
  cambiarEstado(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: cambioEstadoEsquema }) datos: CambioEstado,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.partidos.aplicarActualizacion(id, datos, contexto);
  }

  @Post('partidos/:id/marcador')
  @HttpCode(200)
  actualizarMarcador(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: marcadorEsquema }) datos: Marcador,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.partidos.aplicarActualizacion(id, datos, contexto);
  }

  /** Finaliza el partido con su resultado; la liquidación de sus apuestas se encola sola (FR-025). */
  @Post('partidos/:id/resultado')
  @HttpCode(200)
  registrarResultado(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: resultadoEsquema }) datos: Resultado,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.partidos.registrarResultado(id, datos, contexto);
  }

  @Post('partidos/:id/mercados')
  crearMercado(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: crearMercadoEsquema }) datos: CrearMercado,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.mercados.crearMercado(id, datos, contexto);
  }

  @Put('selecciones/:id/cuota')
  cambiarCuota(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: cambioCuotaEsquema }) datos: CambioCuota,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.mercados.cambiarCuota(id, datos.cuota, contexto);
  }

  @Post('mercados/:id/suspender')
  @HttpCode(200)
  suspenderMercado(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: motivoEsquema }) datos: ConMotivo,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.mercados.suspender(id, datos.motivo, contexto);
  }

  @Post('mercados/:id/reabrir')
  @HttpCode(200)
  reabrirMercado(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: motivoEsquema }) datos: ConMotivo,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    return this.mercados.reabrir(id, datos.motivo, contexto);
  }
}
