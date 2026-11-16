import type { PartidoDetalleDto } from '@apuestas/shared';
import { Body, Controller, HttpCode, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { type ContextoOperacion, ContextoOperador } from '../comun/contexto-operacion.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { Roles } from '../contracts/index.js';
import { idParam } from '../partidos/partidos.esquemas.js';
import { PartidosService } from '../partidos/partidos.service.js';
import { TIPOS_EVENTO_SIMULADO, traducirEventoSimulado } from './simulador.proveedor.js';

const eventoEsquema = z
  .object({
    tipo: z.enum(TIPOS_EVENTO_SIMULADO),
    equipo: z.enum(['LOCAL', 'VISITANTE']).optional(),
    minuto: z.number().int().min(0).max(150).optional(),
  })
  .strict();
type Evento = z.infer<typeof eventoEsquema>;

/**
 * Simulación de partidos para la demo y las pruebas (FR-013, SC-008). Solo existe con
 * API_FOOTBALL_SIMULACION=true: con el proveedor real responde 404. Los eventos entran por
 * aplicarActualizacion con origen SIMULACION, igual que un dato del proveedor.
 */
@Controller('operador/simulacion')
@Roles('OPERADOR', 'ADMINISTRADOR')
export class SimulacionController {
  constructor(
    private readonly partidos: PartidosService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  @Post('partidos/:id/eventos')
  @HttpCode(200)
  async simular(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: eventoEsquema }) evento: Evento,
    @ContextoOperador() contexto: ContextoOperacion,
  ): Promise<PartidoDetalleDto> {
    if (!this.entorno.API_FOOTBALL_SIMULACION) throw new NotFoundException();
    const partido = await this.partidos.obtener(id);
    const cambio = traducirEventoSimulado(partido, evento);
    return this.partidos.aplicarActualizacion(id, cambio, { ...contexto, origen: 'SIMULACION' });
  }
}
