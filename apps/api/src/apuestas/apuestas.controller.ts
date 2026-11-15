import type {
  ApuestaDto,
  Pagina,
  SolicitudVivoAceptadaDto,
  SolicitudVivoDto,
} from '@apuestas/shared';
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ClienteDeLaPeticion, type DatosCliente } from '../comun/contexto-operacion.js';
import { Roles, type UsuarioAutenticado, UsuarioActual } from '../contracts/index.js';
import { idParam } from '../partidos/partidos.esquemas.js';
import { AceptacionService } from './aceptacion.service.js';
import {
  type ConsultaApuestas,
  consultaApuestasEsquema,
  type SolicitudApuesta,
  solicitudApuestaEsquema,
} from './apuestas.esquemas.js';
import { ApuestasService } from './apuestas.service.js';

/** Límite propio de POST /apuestas contra el abuso automatizado (contracts/api-rest.md). */
const LIMITE_APUESTAS = { default: { limit: 60, ttl: 60_000 } };

/**
 * Apuestas del apostador (FR-014, FR-023). No hay PUT, PATCH ni DELETE: una apuesta aceptada es inmutable
 * (FR-021). OPERADOR y ADMINISTRADOR no pueden apostar (FR-039).
 */
@Controller('apuestas')
@Roles('APOSTADOR')
export class ApuestasController {
  constructor(
    private readonly aceptacion: AceptacionService,
    private readonly apuestas: ApuestasService,
  ) {}

  /**
   * 201 con la apuesta nueva; 200 con la misma apuesta si la claveSolicitud ya se usó (FR-020).
   * 202 con `{ solicitudId, ejecutarEn }` si alguna selección es de un partido en vivo (FR-018): el resultado
   * llega por WebSocket (`apuesta.vivo_resuelta`) y en GET /apuestas/solicitudes-vivo/:id.
   */
  @Post()
  @Throttle(LIMITE_APUESTAS)
  async apostar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body({ schema: solicitudApuestaEsquema }) solicitud: SolicitudApuesta,
    @ClienteDeLaPeticion() cliente: DatosCliente,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<ApuestaDto | SolicitudVivoAceptadaDto> {
    const resultado = await this.aceptacion.aceptar(usuario, solicitud, cliente);
    if (resultado.tipo === 'vivo') {
      respuesta.status(202);
      return resultado.solicitud;
    }
    respuesta.status(resultado.nueva ? 201 : 200);
    return resultado.apuesta;
  }

  /** Antes de `:id`: si no, "solicitudes-vivo" se tomaría como el id de una apuesta. */
  @Get('solicitudes-vivo/:id')
  obtenerSolicitudVivo(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<SolicitudVivoDto> {
    return this.apuestas.obtenerSolicitudVivo(usuario.id, id);
  }

  @Get()
  listar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Query({ schema: consultaApuestasEsquema }) consulta: ConsultaApuestas,
  ): Promise<Pagina<ApuestaDto>> {
    return this.apuestas.listar(usuario.id, consulta);
  }

  @Get(':id')
  obtener(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<ApuestaDto> {
    return this.apuestas.obtener(usuario.id, id);
  }
}
