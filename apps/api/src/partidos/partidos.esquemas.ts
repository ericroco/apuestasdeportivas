import { CODIGOS_SELECCION, ESTADOS_PARTIDO, TIPOS_MERCADO } from '@apuestas/shared';
import { z } from 'zod';
import { cuotaTexto } from '../comun/decimal.js';

/**
 * Entrada de las rutas del Spec 3 (contracts/api-rest.md), validada con StandardSchemaValidationPipe.
 * Todos los objetos son `.strict()`: un campo de más (p. ej. `estado` al crear) es un 400.
 * Las cuotas viajan como texto decimal; las fechas en ISO 8601 con zona horaria.
 */

const MAX_POR_PAGINA = 50;

const nombreEquipo = z.string().trim().min(1).max(80);
const fechaIso = z.iso.datetime({ offset: true }).transform((valor) => new Date(valor));
const motivo = z.string().trim().min(1, 'el motivo es obligatorio').max(500);

export const idParam = z.uuid('el identificador debe ser un UUID');

export const crearCompeticionEsquema = z
  .object({
    nombre: z.string().trim().min(2).max(120),
    pais: z.string().trim().min(2).max(80).optional(),
  })
  .strict();
export type CrearCompeticion = z.infer<typeof crearCompeticionEsquema>;

export const crearPartidoEsquema = z
  .object({
    competicionId: z.uuid(),
    nombreLocal: nombreEquipo,
    nombreVisitante: nombreEquipo,
    inicioEn: fechaIso,
  })
  .strict()
  .refine((p) => p.nombreLocal.toLowerCase() !== p.nombreVisitante.toLowerCase(), {
    message: 'el equipo local y el visitante deben ser distintos',
    path: ['nombreVisitante'],
  });
export type CrearPartido = z.infer<typeof crearPartidoEsquema>;

export const editarPartidoEsquema = z
  .object({
    nombreLocal: nombreEquipo.optional(),
    nombreVisitante: nombreEquipo.optional(),
    inicioEn: fechaIso.optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'no hay cambios que aplicar' });
export type EditarPartido = z.infer<typeof editarPartidoEsquema>;

export const cambioEstadoEsquema = z
  .object({
    estado: z.enum(ESTADOS_PARTIDO),
    /** Obligatoria al reprogramar un partido aplazado. */
    inicioEn: fechaIso.optional(),
    motivo,
  })
  .strict();
export type CambioEstado = z.infer<typeof cambioEstadoEsquema>;

const goles = z.number().int().min(0).max(99);

export const marcadorEsquema = z
  .object({
    golesLocal: goles,
    golesVisitante: goles,
    minuto: z.number().int().min(0).max(150).optional(),
  })
  .strict();
export type Marcador = z.infer<typeof marcadorEsquema>;

/** Resultado final del tiempo reglamentario (POST /operador/partidos/:id/resultado); el motivo es obligatorio. */
export const resultadoEsquema = z
  .object({ golesLocal: goles, golesVisitante: goles, motivo })
  .strict();
export type Resultado = z.infer<typeof resultadoEsquema>;

export const crearMercadoEsquema = z
  .object({
    tipo: z.enum(TIPOS_MERCADO),
    linea: z.string().optional(),
    admiteVivo: z.boolean().default(false),
    selecciones: z
      .array(z.object({ codigo: z.enum(CODIGOS_SELECCION), cuota: z.string() }).strict())
      .min(1)
      .max(3),
  })
  .strict();
export type CrearMercado = z.infer<typeof crearMercadoEsquema>;

export const cambioCuotaEsquema = z.object({ cuota: cuotaTexto }).strict();
export type CambioCuota = z.infer<typeof cambioCuotaEsquema>;

export const motivoEsquema = z.object({ motivo }).strict();
export type ConMotivo = z.infer<typeof motivoEsquema>;

export const consultaCarteleraEsquema = z
  .object({
    estado: z.enum(ESTADOS_PARTIDO).optional(),
    competicionId: z.uuid().optional(),
    desde: fechaIso.optional(),
    hasta: fechaIso.optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(MAX_POR_PAGINA).default(20),
  })
  .strict();
export type ConsultaCartelera = z.infer<typeof consultaCarteleraEsquema>;
