import {
  RESOLUCIONES_ALERTA,
  type SolicitudResolucionAlerta,
  type VistaAlerta,
} from '@apuestas/shared';
import { z } from 'zod';
import { accionFallida, estadoDesdeResultado, type EstadoAccion } from '@/lib/acciones';
import type { Resultado } from '@/lib/resultado';

/** Resolución de una alerta: confirmar fraude o descartar, con una nota obligatoria. */

export const NOTA_MINIMA = 5;
export const NOTA_MAXIMA = 500;

const esquemaResolucion = z.object({
  estado: z.enum(RESOLUCIONES_ALERTA, { error: 'Elige Confirmar fraude o Descartar alerta.' }),
  nota: z
    .string({ error: 'Escribe una nota que explique la decisión.' })
    .trim()
    .min(
      NOTA_MINIMA,
      `Escribe una nota de al menos ${NOTA_MINIMA} caracteres que explique la decisión.`,
    )
    .max(NOTA_MAXIMA, `La nota puede tener como máximo ${NOTA_MAXIMA} caracteres.`),
});

export type LecturaResolucion =
  | { readonly ok: true; readonly solicitud: SolicitudResolucionAlerta }
  | { readonly ok: false; readonly mensaje: string };

export function leerResolucion(formData: FormData): LecturaResolucion {
  const lectura = esquemaResolucion.safeParse({
    estado: formData.get('estado'),
    nota: formData.get('nota'),
  });
  return lectura.success
    ? { ok: true, solicitud: lectura.data }
    : { ok: false, mensaje: lectura.error.issues[0]?.message ?? 'Revisa la resolución.' };
}

const MENSAJE_EXITO = {
  CONFIRMADA: 'Alerta confirmada como fraude. La resolución quedó registrada con tu nota.',
  DESCARTADA: 'Alerta descartada. La resolución quedó registrada con tu nota.',
} as const;

export async function procesarResolucion(
  previo: EstadoAccion,
  formData: FormData,
  resolver: (solicitud: SolicitudResolucionAlerta) => Promise<Resultado<VistaAlerta>>,
): Promise<EstadoAccion> {
  const lectura = leerResolucion(formData);
  if (!lectura.ok) return accionFallida(previo, lectura.mensaje);
  const resultado = await resolver(lectura.solicitud);
  return estadoDesdeResultado(previo, resultado, () => MENSAJE_EXITO[lectura.solicitud.estado]);
}
