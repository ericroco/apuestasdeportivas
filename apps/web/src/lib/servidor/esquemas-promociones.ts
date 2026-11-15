import {
  ESTADOS_ALERTA,
  ESTADOS_BONO,
  ESTADOS_CUPON,
  MOTIVOS_RECHAZO_CUPON,
  REGLAS_FRAUDE,
  SEVERIDADES_ALERTA,
  TIPOS_CUPON,
  type DetalleCupon,
  type MisBonos,
  type Paginado,
  type VistaAlerta,
  type VistaCupon,
} from '@apuestas/shared';
import { z, type ZodType } from 'zod';

/**
 * Esquemas de las respuestas de `apps/api` (contracts/api-rest.md). La web valida lo que recibe antes de
 * mostrarlo; `satisfies` garantiza que coinciden con los tipos compartidos de `@apuestas/shared`.
 */

/** Texto decimal (`"10.50"`, `"-3.00"`): se muestra tal cual, nunca se convierte para calcular. */
export const textoDecimal = z.string().regex(/^-?\d{1,14}(\.\d{1,2})?$/);

/** Fecha ISO 8601 que `Date` puede interpretar; una inválida haría fallar el formateo de la página. */
export const fechaIso = z.string().refine((valor) => !Number.isNaN(Date.parse(valor)));

const entero = z.number().int().nonnegative();

export const esquemaVistaCupon = z.object({
  id: z.string().min(1),
  codigo: z.string().min(1),
  tipo: z.enum(TIPOS_CUPON),
  porcentaje: textoDecimal.nullable(),
  montoFijo: textoDecimal.nullable(),
  topeBono: textoDecimal.nullable(),
  depositoMinimo: textoDecimal.nullable(),
  apuestaMaxima: textoDecimal.nullable(),
  iniciaEn: fechaIso,
  terminaEn: fechaIso,
  cupoTotal: entero,
  limitePorUsuario: entero,
  canjes: entero,
  estado: z.enum(ESTADOS_CUPON),
  vigente: z.boolean(),
  creadoEn: fechaIso,
}) satisfies ZodType<VistaCupon>;

export const esquemaDetalleCupon = esquemaVistaCupon.extend({
  resumenCanjes: z.object({
    aceptados: entero,
    rechazados: entero,
    bonoOtorgado: textoDecimal,
  }),
}) satisfies ZodType<DetalleCupon>;

export function esquemaPaginado<T>(elemento: ZodType<T>): ZodType<Paginado<T>> {
  return z.object({
    datos: z.array(elemento),
    total: entero,
    pagina: z.number().int().positive(),
    tamano: z.number().int().positive(),
  });
}

const esquemaMotivo = z.object({
  codigo: z.enum(MOTIVOS_RECHAZO_CUPON),
  mensaje: z.string(),
});

const esquemaVistaBono = z.object({
  id: z.string().min(1),
  monto: textoDecimal,
  requisito: textoDecimal,
  avance: textoDecimal,
  porcentajeAvance: z.number().min(0).max(100),
  estado: z.enum(ESTADOS_BONO),
  otorgadoEn: fechaIso,
  venceEn: fechaIso,
  codigoCupon: z.string(),
});

export const esquemaMisBonos = z.object({
  activo: esquemaVistaBono.nullable(),
  historial: z.array(
    esquemaVistaBono.extend({
      montoConvertido: textoDecimal.nullable(),
      cumplidoEn: fechaIso.nullable(),
    }),
  ),
  canjesRechazados: z.array(
    z.object({ codigo: z.string(), motivo: esquemaMotivo, creadoEn: fechaIso }),
  ),
  cuotaMinima: textoDecimal,
}) satisfies ZodType<MisBonos>;

export const esquemaVistaAlerta = z.object({
  id: z.string().min(1),
  regla: z.enum(REGLAS_FRAUDE),
  severidad: z.enum(SEVERIDADES_ALERTA),
  usuarioId: z.string(),
  evidencia: z.record(z.string(), z.unknown()),
  estado: z.enum(ESTADOS_ALERTA),
  nota: z.string().nullable(),
  resueltaPor: z.string().nullable(),
  resueltaEn: fechaIso.nullable(),
  creadaEn: fechaIso,
}) satisfies ZodType<VistaAlerta>;
