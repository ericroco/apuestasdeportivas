import { TIPOS_CUPON, type SolicitudCrearCupon, type VistaCupon } from '@apuestas/shared';
import { z } from 'zod';
import { aIsoDesdeLocal } from '@/lib/formato';
import { mensajeDeFallo } from '@/lib/mensajes';
import type { Resultado } from '@/lib/resultado';
import {
  campoDecimal,
  campoEntero,
  campoFechaHora,
  campoPorcentaje,
  erroresPorCampo,
} from './campos';

/** Formulario "Crear cupón": lectura del FormData y estado que devuelve la Server Action. */

export const CAMPOS_CUPON = [
  'codigo',
  'tipo',
  'porcentaje',
  'montoFijo',
  'topeBono',
  'depositoMinimo',
  'apuestaMaxima',
  'iniciaEn',
  'terminaEn',
  'cupoTotal',
  'limitePorUsuario',
] as const;

export type CampoCupon = (typeof CAMPOS_CUPON)[number];
export type ValoresCupon = Partial<Record<CampoCupon, string>>;
export type ErroresCupon = Partial<Record<CampoCupon, string>>;

export type LecturaCupon =
  | { readonly ok: true; readonly solicitud: SolicitudCrearCupon }
  | { readonly ok: false; readonly errores: ErroresCupon };

export interface EstadoFormularioCupon {
  readonly intento: number;
  readonly errores: ErroresCupon;
  /** Error general (la API rechazó o no respondió). */
  readonly mensaje: string | null;
  /** Lo que escribió el operador, para no perderlo al mostrar errores. */
  readonly valores: ValoresCupon;
}

export const FORMULARIO_INICIAL: EstadoFormularioCupon = {
  intento: 0,
  errores: {},
  mensaje: null,
  valores: {},
};

const LARGO_MAXIMO_VALOR = 100;

const MENSAJE_CODIGO = 'El código lleva de 4 a 20 letras o números, sin símbolos.';

const comunes = z.object({
  codigo: z
    .string({ error: MENSAJE_CODIGO })
    .transform((valor) => valor.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{4,20}$/, MENSAJE_CODIGO)),
  iniciaEn: campoFechaHora('Elige la fecha y hora de inicio.'),
  terminaEn: campoFechaHora('Elige la fecha y hora de fin.'),
  cupoTotal: campoEntero('El cupo total es un número entero mayor que 0.', 1),
  limitePorUsuario: campoEntero('El límite por usuario es un número entero desde 1.', 1),
});

const ESQUEMAS = {
  BONO_DEPOSITO: comunes.extend({
    tipo: z.literal('BONO_DEPOSITO'),
    porcentaje: campoPorcentaje('El porcentaje del bono va de 1 a 200.', 1, 200),
    topeBono: campoDecimal('Escribe el tope del bono, mayor que 0 (p. ej. 10.00).', {
      positivo: true,
    }),
    depositoMinimo: campoDecimal(
      'Escribe el depósito mínimo con hasta dos decimales (0 si no hay).',
    ),
  }),
  APUESTA_GRATIS: comunes.extend({
    tipo: z.literal('APUESTA_GRATIS'),
    montoFijo: campoDecimal('Escribe el monto de la apuesta gratis, mayor que 0 (p. ej. 5.00).', {
      positivo: true,
    }),
  }),
  AUMENTO_CUOTA: comunes.extend({
    tipo: z.literal('AUMENTO_CUOTA'),
    porcentaje: campoPorcentaje('El aumento de cuota va de 1 a 100 %.', 1, 100),
    apuestaMaxima: campoDecimal('Escribe el monto máximo de apuesta, mayor que 0.', {
      positivo: true,
    }),
  }),
} as const;

const MENSAJE_TIPO = 'Elige el tipo de cupón.';
const esquemaTipo = z.enum(TIPOS_CUPON, { error: MENSAJE_TIPO });

/** Error de orden de la vigencia; se revisa aparte para mostrarlo junto con los demás errores. */
function errorDeVigencia(valores: ValoresCupon): ErroresCupon {
  const inicio = aIsoDesdeLocal(valores.iniciaEn ?? '');
  const fin = aIsoDesdeLocal(valores.terminaEn ?? '');
  if (inicio === null || fin === null || Date.parse(fin) > Date.parse(inicio)) return {};
  return { terminaEn: 'El fin de la vigencia debe ser posterior al inicio.' };
}

export function valoresDelFormulario(formData: FormData): ValoresCupon {
  return Object.fromEntries(
    CAMPOS_CUPON.flatMap((campo) => {
      const valor = formData.get(campo);
      return typeof valor === 'string' ? [[campo, valor.slice(0, LARGO_MAXIMO_VALOR)]] : [];
    }),
  );
}

export function leerFormularioCupon(formData: FormData): LecturaCupon {
  const valores = valoresDelFormulario(formData);
  const tipo = esquemaTipo.safeParse(valores.tipo);
  if (!tipo.success) {
    const otros = comunes.safeParse(valores);
    const errores = otros.success ? {} : erroresPorCampo<CampoCupon>(otros.error);
    return { ok: false, errores: { ...errorDeVigencia(valores), ...errores, tipo: MENSAJE_TIPO } };
  }
  const lectura = ESQUEMAS[tipo.data].safeParse(valores);
  const errores = {
    ...errorDeVigencia(valores),
    ...(lectura.success ? {} : erroresPorCampo<CampoCupon>(lectura.error)),
  };
  if (lectura.success && Object.keys(errores).length === 0) {
    return { ok: true, solicitud: lectura.data };
  }
  return { ok: false, errores };
}

export type ResultadoCreacion =
  | { readonly tipo: 'creado'; readonly id: string }
  | { readonly tipo: 'formulario'; readonly estado: EstadoFormularioCupon };

/** Valida, crea en la API y devuelve el cupón creado o el estado del formulario con sus errores. */
export async function procesarCreacionCupon(
  previo: EstadoFormularioCupon,
  formData: FormData,
  crear: (solicitud: SolicitudCrearCupon) => Promise<Resultado<VistaCupon>>,
): Promise<ResultadoCreacion> {
  const valores = valoresDelFormulario(formData);
  const base = { intento: previo.intento + 1, valores, errores: {}, mensaje: null };
  const lectura = leerFormularioCupon(formData);
  if (!lectura.ok) return { tipo: 'formulario', estado: { ...base, errores: lectura.errores } };
  const resultado = await crear(lectura.solicitud);
  if (resultado.tipo === 'ok') return { tipo: 'creado', id: resultado.datos.id };
  return { tipo: 'formulario', estado: { ...base, mensaje: mensajeDeFallo(resultado) } };
}
