import { ESTADOS_APUESTA } from '@apuestas/shared';
import { z } from 'zod';
import { cuotaTexto, montoTexto } from '../comun/decimal.js';

/** Tope técnico de selecciones por petición; el de negocio es APUESTA_MAX_SELECCIONES. */
const MAX_SELECCIONES_PETICION = 20;
const MAX_POR_PAGINA = 50;

/**
 * Cuerpo de POST /apuestas (contracts/api-rest.md). `.strict()`: el cliente no puede mandar hora, cuota total ni
 * ganancia; el servidor las calcula (FR-041). La cuota vista solo sirve para detectar que cambió.
 */
export const solicitudApuestaEsquema = z
  .object({
    claveSolicitud: z.uuid('claveSolicitud debe ser un UUID'),
    monto: montoTexto,
    selecciones: z
      .array(z.object({ seleccionId: z.uuid(), cuotaVista: cuotaTexto }).strict())
      .min(1)
      .max(MAX_SELECCIONES_PETICION),
    codigoCupon: z.string().trim().min(1).max(40).optional(),
  })
  .strict();
export type SolicitudApuesta = z.infer<typeof solicitudApuestaEsquema>;

export const consultaApuestasEsquema = z
  .object({
    estado: z.enum(ESTADOS_APUESTA).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(MAX_POR_PAGINA).default(20),
  })
  .strict();
export type ConsultaApuestas = z.infer<typeof consultaApuestasEsquema>;
