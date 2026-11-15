import type {
  CompeticionDto,
  MercadoDto,
  PartidoDetalleDto,
  PartidoResumenDto,
} from '@apuestas/shared';
import { aTexto } from '../comun/decimal.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Relaciones que se cargan para responder el detalle de un partido. */
export const INCLUIR_DETALLE = {
  competicion: true,
  mercados: {
    orderBy: [{ tipo: 'asc' }, { linea: 'asc' }],
    include: { selecciones: { orderBy: { codigo: 'asc' } } },
  },
} as const satisfies Prisma.PartidoInclude;

type PartidoConDetalle = Prisma.PartidoGetPayload<{ include: typeof INCLUIR_DETALLE }>;
type PartidoConCompeticion = Prisma.PartidoGetPayload<{ include: { competicion: true } }>;
type Competicion = PartidoConCompeticion['competicion'];
type Mercado = PartidoConDetalle['mercados'][number];

export function aCompeticionDto(competicion: Competicion): CompeticionDto {
  return { id: competicion.id, nombre: competicion.nombre, pais: competicion.pais };
}

export function aPartidoResumenDto(partido: PartidoConCompeticion): PartidoResumenDto {
  return {
    id: partido.id,
    competicion: aCompeticionDto(partido.competicion),
    nombreLocal: partido.nombreLocal,
    nombreVisitante: partido.nombreVisitante,
    inicioEn: partido.inicioEn.toISOString(),
    estado: partido.estado,
    golesLocal: partido.golesLocal,
    golesVisitante: partido.golesVisitante,
    minuto: partido.minuto,
  };
}

export function aMercadoDto(mercado: Mercado): MercadoDto {
  return {
    id: mercado.id,
    tipo: mercado.tipo,
    linea: mercado.linea ? mercado.linea.toFixed(1) : null,
    estado: mercado.estado,
    admiteVivo: mercado.admiteVivo,
    selecciones: mercado.selecciones.map((seleccion) => ({
      id: seleccion.id,
      codigo: seleccion.codigo,
      cuota: aTexto(seleccion.cuota),
      resultado: seleccion.resultado,
    })),
  };
}

export function aPartidoDetalleDto(partido: PartidoConDetalle): PartidoDetalleDto {
  return {
    ...aPartidoResumenDto(partido),
    version: partido.version,
    mercados: partido.mercados.map(aMercadoDto),
  };
}
