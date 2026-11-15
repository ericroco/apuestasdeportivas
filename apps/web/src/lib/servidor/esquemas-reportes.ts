import { z } from 'zod';
import { fechaIso, textoDecimal } from './esquemas-promociones';

/**
 * Esquemas de las respuestas de `apps/reports` (contracts/reportes.md §2). Las métricas las calcula
 * reportes; la web solo valida que lleguen completas y las muestra.
 */

const entero = z.number().int().nonnegative();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const esquemaResumen = z.object({
  apuestas: z.object({
    cantidad: entero,
    volumen: textoDecimal,
    premiosPagados: textoDecimal,
    ggr: textoDecimal,
    usuariosActivos: entero,
  }),
  depositos: z.object({ cantidad: entero, monto: textoDecimal }),
  retiros: z.object({ cantidad: entero, monto: textoDecimal }),
  cupones: z.object({
    canjesAceptados: entero,
    canjesRechazados: entero,
    bonoOtorgado: textoDecimal,
  }),
  alertas: z.object({
    abiertas: entero,
    confirmadas: entero,
    descartadas: entero,
    altas: entero,
    medias: entero,
  }),
  generadoEn: fechaIso,
});

export const esquemaDiaSerie = z.object({
  fecha: dia,
  volumen: textoDecimal,
  premiosPagados: textoDecimal,
  ggr: textoDecimal,
  apuestas: entero,
  depositos: textoDecimal,
  retiros: textoDecimal,
});

export const esquemaSerieDiaria = z.object({ dias: z.array(esquemaDiaSerie) });

export const esquemaCompeticiones = z.object({
  competiciones: z.array(
    z.object({
      competicionId: z.string().min(1),
      nombre: z.string(),
      deporte: z.string().nullable(),
      apuestas: entero,
      volumen: textoDecimal,
      ggr: textoDecimal,
    }),
  ),
});

export type ResumenReporte = z.infer<typeof esquemaResumen>;
export type DiaSerie = z.infer<typeof esquemaDiaSerie>;
export type SerieDiaria = z.infer<typeof esquemaSerieDiaria>;
export type DesgloseCompeticiones = z.infer<typeof esquemaCompeticiones>;
export type CompeticionReporte = DesgloseCompeticiones['competiciones'][number];
