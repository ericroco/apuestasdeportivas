import {
  CODIGOS_SELECCION,
  ESTADOS_APUESTA,
  ESTADOS_MERCADO,
  ESTADOS_PARTIDO,
  ESTADOS_SOLICITUD_VIVO,
  RESULTADOS_SELECCION,
  TIPOS_APUESTA,
  TIPOS_MERCADO,
  TIPOS_SALDO,
  type ApuestaDto,
  type CompeticionDto,
  type ConsumoProveedorDto,
  type Pagina,
  type PartidoDetalleDto,
  type PartidoResumenDto,
  type SolicitudVivoAceptadaDto,
  type SolicitudVivoDto,
} from '@apuestas/shared';
import { z, type ZodType } from 'zod';

/**
 * Esquemas de las respuestas del Spec 3 (specs/003-partidos-apuestas-liquidacion/contracts/api-rest.md). La web
 * valida lo que recibe antes de mostrarlo; `satisfies` garantiza que coinciden con los tipos de `@apuestas/shared`.
 */

/** Texto decimal (`"2.10"`, `"-21.00"`): se muestra tal cual, nunca se convierte para calcular saldos. */
const decimal = z.string().regex(/^-?\d{1,14}(\.\d{1,2})?$/);
const fecha = z.iso.datetime({ offset: true });
const goles = z.number().int().min(0).nullable();

export const competicionEsquema = z.object({
  id: z.string(),
  nombre: z.string(),
  pais: z.string().nullable(),
}) satisfies ZodType<CompeticionDto>;

const seleccionEsquema = z.object({
  id: z.string(),
  codigo: z.enum(CODIGOS_SELECCION),
  cuota: decimal,
  resultado: z.enum(RESULTADOS_SELECCION),
});

const mercadoEsquema = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_MERCADO),
  linea: z.string().nullable(),
  estado: z.enum(ESTADOS_MERCADO),
  admiteVivo: z.boolean(),
  selecciones: z.array(seleccionEsquema),
});

export const partidoResumenEsquema = z.object({
  id: z.string(),
  competicion: competicionEsquema,
  nombreLocal: z.string(),
  nombreVisitante: z.string(),
  inicioEn: fecha,
  estado: z.enum(ESTADOS_PARTIDO),
  golesLocal: goles,
  golesVisitante: goles,
  minuto: z.number().int().nullable(),
}) satisfies ZodType<PartidoResumenDto>;

export const partidoDetalleEsquema = partidoResumenEsquema.extend({
  version: z.number().int(),
  mercados: z.array(mercadoEsquema),
}) satisfies ZodType<PartidoDetalleDto>;

export function paginaEsquema<T>(elemento: ZodType<T>): ZodType<Pagina<T>> {
  return z.object({
    elementos: z.array(elemento),
    pagina: z.number().int(),
    porPagina: z.number().int(),
    total: z.number().int(),
  });
}

export const apuestaEsquema = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_APUESTA),
  monto: decimal,
  tipoSaldo: z.enum(TIPOS_SALDO),
  cuotaTotal: decimal,
  gananciaPotencial: decimal,
  estado: z.enum(ESTADOS_APUESTA),
  premioPagado: decimal,
  enVivo: z.boolean(),
  aceptadaEn: fecha,
  liquidadaEn: fecha.nullable(),
  selecciones: z.array(
    z.object({
      id: z.string(),
      seleccionId: z.string(),
      partidoId: z.string(),
      cuotaCongelada: decimal,
      resultado: z.enum(RESULTADOS_SELECCION),
    }),
  ),
}) satisfies ZodType<ApuestaDto>;

export const solicitudVivoAceptadaEsquema = z.object({
  solicitudId: z.string(),
  ejecutarEn: fecha,
}) satisfies ZodType<SolicitudVivoAceptadaDto>;

export const solicitudVivoEsquema = z.object({
  id: z.string(),
  estado: z.enum(ESTADOS_SOLICITUD_VIVO),
  apuestaId: z.string().nullable(),
  motivoRechazo: z.string().nullable(),
  ejecutarEn: fecha,
  creadaEn: fecha,
}) satisfies ZodType<SolicitudVivoDto>;

export const consumoEsquema = z.object({
  fecha: z.string(),
  consultas: z.number().int(),
  limite: z.number().int(),
  agotado: z.boolean(),
}) satisfies ZodType<ConsumoProveedorDto>;

/** Datos de los errores de negocio que la web usa para guiar al apostador. */
export const cuotasVigentesEsquema = z.object({
  cuotasVigentes: z.array(z.object({ seleccionId: z.string(), cuota: decimal })),
});
