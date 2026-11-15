import { ESTADOS_CUPON, type CambioCupon, type VistaCupon } from '@apuestas/shared';
import { z } from 'zod';
import { accionFallida, estadoDesdeResultado, type EstadoAccion } from '@/lib/acciones';
import { formatearEntero, formatearFechaHora } from '@/lib/formato';
import type { Resultado } from '@/lib/resultado';
import { campoEntero, campoFechaHora } from './campos';

/** Cambios que el operador puede hacer siempre sobre un cupón: pausar/reactivar, extender y ampliar. */

export type LecturaCambio =
  | { readonly ok: true; readonly cambio: CambioCupon }
  | { readonly ok: false; readonly mensaje: string };

function leer(esquema: z.ZodType<CambioCupon>, formData: FormData): LecturaCambio {
  const lectura = esquema.safeParse(Object.fromEntries(formData));
  return lectura.success
    ? { ok: true, cambio: lectura.data }
    : { ok: false, mensaje: lectura.error.issues[0]?.message ?? 'Revisa el dato.' };
}

const esquemaEstado = z.object({
  estado: z.enum(ESTADOS_CUPON, { error: 'Elige si el cupón queda activo o pausado.' }),
});

const esquemaExtension = z.object({
  terminaEn: campoFechaHora('Elige la nueva fecha y hora de fin de la vigencia.'),
});

const esquemaAmpliacion = z.object({
  cupoTotal: campoEntero('Escribe el nuevo cupo total como un número entero mayor que 0.', 1),
});

export function leerCambioEstado(formData: FormData): LecturaCambio {
  return leer(esquemaEstado, formData);
}

export function leerExtension(formData: FormData): LecturaCambio {
  return leer(esquemaExtension, formData);
}

export function leerAmpliacion(formData: FormData): LecturaCambio {
  return leer(esquemaAmpliacion, formData);
}

/** El mensaje nombra lo que cambió, con los datos que devolvió la API. */
function mensajeDeExito(cambio: CambioCupon, cupon: VistaCupon): string {
  if (cambio.estado === 'PAUSADO') {
    return 'Cupón pausado. No acepta canjes nuevos hasta que lo reactives.';
  }
  if (cambio.estado === 'ACTIVO') return 'Cupón reactivado. Vuelve a aceptar canjes.';
  if (cambio.terminaEn)
    return `Vigencia extendida hasta el ${formatearFechaHora(cupon.terminaEn)} (hora de Ecuador).`;
  return `Cupo ampliado a ${formatearEntero(cupon.cupoTotal)} canjes.`;
}

export async function procesarCambioCupon(
  previo: EstadoAccion,
  lectura: LecturaCambio,
  actualizar: (cambio: CambioCupon) => Promise<Resultado<VistaCupon>>,
): Promise<EstadoAccion> {
  if (!lectura.ok) return accionFallida(previo, lectura.mensaje);
  const resultado = await actualizar(lectura.cambio);
  return estadoDesdeResultado(previo, resultado, (cupon) => mensajeDeExito(lectura.cambio, cupon));
}
