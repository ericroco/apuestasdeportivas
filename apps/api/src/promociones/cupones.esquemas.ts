import { z } from 'zod';
import { camposDePaginacion, filtroOpcional } from '../comun/consultas.js';
import { montoPositivo, textoDecimal } from '../comun/montos.js';

export const TIPOS_CUPON = ['BONO_DEPOSITO', 'APUESTA_GRATIS', 'AUMENTO_CUOTA'] as const;
export const ESTADOS_CUPON = ['ACTIVO', 'PAUSADO'] as const;

/** Formato de un código ya normalizado (FR-001). */
export const FORMATO_CODIGO = /^[A-Z0-9]{4,20}$/;

/** Los códigos no distinguen mayúsculas ni espacios: se guardan y se buscan normalizados. */
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/\s+/g, '').toUpperCase();
}

const codigoCupon = z
  .string()
  .max(40)
  .transform(normalizarCodigo)
  .pipe(z.string().regex(FORMATO_CODIGO, 'debe tener de 4 a 20 letras o números'));

const porcentajeEntre = (minimo: number, maximo: number) =>
  textoDecimal.refine(
    (porcentaje) => porcentaje.gte(minimo) && porcentaje.lte(maximo),
    `debe estar entre ${minimo} y ${maximo}`,
  );

const fechaIso = z.iso
  .datetime({ offset: true, message: 'debe ser una fecha ISO 8601, como "2026-12-01T00:00:00Z"' })
  .transform((valor) => new Date(valor));

const cupoTotal = z.number().int().min(1).max(1_000_000);
const limitePorUsuario = z.number().int().min(1).max(1_000);

const comunes = {
  codigo: codigoCupon,
  iniciaEn: fechaIso,
  terminaEn: fechaIso,
  cupoTotal,
  limitePorUsuario: limitePorUsuario.default(1),
};

/** Campos propios de cada tipo (FR-002). Un campo de otro tipo se rechaza por `strictObject`. */
export const esquemaCrearCupon = z
  .discriminatedUnion('tipo', [
    z.strictObject({
      tipo: z.literal('BONO_DEPOSITO'),
      ...comunes,
      porcentaje: porcentajeEntre(1, 200),
      topeBono: montoPositivo,
      depositoMinimo: textoDecimal,
    }),
    z.strictObject({ tipo: z.literal('APUESTA_GRATIS'), ...comunes, montoFijo: montoPositivo }),
    z.strictObject({
      tipo: z.literal('AUMENTO_CUOTA'),
      ...comunes,
      porcentaje: porcentajeEntre(1, 100),
      apuestaMaxima: montoPositivo,
    }),
  ])
  .refine((cupon) => cupon.terminaEn > cupon.iniciaEn, {
    message: 'debe ser posterior a iniciaEn',
    path: ['terminaEn'],
  });

/**
 * PATCH: estado, vigencia y cupo siempre; el resto solo sin canjes (lo decide `planificarCambios`, que además valida
 * la configuración resultante con `esquemaCrearCupon`).
 */
export const esquemaActualizarCupon = z
  .strictObject({
    estado: z.enum(ESTADOS_CUPON).optional(),
    terminaEn: fechaIso.optional(),
    cupoTotal: cupoTotal.optional(),
    tipo: z.enum(TIPOS_CUPON).optional(),
    porcentaje: porcentajeEntre(1, 200).optional(),
    montoFijo: montoPositivo.optional(),
    topeBono: montoPositivo.optional(),
    depositoMinimo: textoDecimal.optional(),
    apuestaMaxima: montoPositivo.optional(),
    iniciaEn: fechaIso.optional(),
    limitePorUsuario: limitePorUsuario.optional(),
  })
  .refine((cambios) => Object.keys(cambios).length > 0, 'indica al menos un campo para cambiar');

export const esquemaFiltrosCupones = z.strictObject({
  estado: filtroOpcional(z.enum(ESTADOS_CUPON)),
  tipo: filtroOpcional(z.enum(TIPOS_CUPON)),
  busqueda: filtroOpcional(z.string().max(40)),
  ...camposDePaginacion,
});

export const esquemaIdCupon = z.uuid('debe ser un identificador válido');

export type CrearCupon = z.output<typeof esquemaCrearCupon>;
export type ActualizarCupon = z.output<typeof esquemaActualizarCupon>;
export type FiltrosCupones = z.output<typeof esquemaFiltrosCupones>;
