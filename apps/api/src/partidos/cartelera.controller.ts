import type {
  CompeticionDto,
  Pagina,
  PartidoDetalleDto,
  PartidoResumenDto,
} from '@apuestas/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { type ConsultaCartelera, consultaCarteleraEsquema, idParam } from './partidos.esquemas.js';
import { PartidosService } from './partidos.service.js';

/** Cartelera y detalle: cualquier usuario con sesión (FR-008). Sin `@Roles`: basta estar autenticado. */
@Controller()
export class CarteleraController {
  constructor(private readonly partidos: PartidosService) {}

  @Get('partidos')
  listar(
    @Query({ schema: consultaCarteleraEsquema }) consulta: ConsultaCartelera,
  ): Promise<Pagina<PartidoResumenDto>> {
    return this.partidos.listar(consulta);
  }

  @Get('partidos/:id')
  obtener(@Param('id', { schema: idParam }) id: string): Promise<PartidoDetalleDto> {
    return this.partidos.obtener(id);
  }

  @Get('competiciones')
  listarCompeticiones(): Promise<CompeticionDto[]> {
    return this.partidos.listarCompeticiones();
  }
}
