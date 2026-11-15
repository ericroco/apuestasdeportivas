'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { accionFallida, type EstadoAccion } from '@/lib/acciones';
import {
  leerAmpliacion,
  leerCambioEstado,
  leerExtension,
  procesarCambioCupon,
  type LecturaCambio,
} from '@/lib/cupones/cambios';
import { procesarCreacionCupon, type EstadoFormularioCupon } from '@/lib/cupones/formulario';
import { esIdentificador } from '@/lib/parametros';
import { actualizarCupon, crearCupon } from '@/lib/servidor/promociones';
import { clienteApiDeLaSesion } from '@/lib/servidor/sesion';

/**
 * Server Actions de cupones. Se pueden invocar con un POST directo, así que no confían en la pantalla:
 * validan la entrada y la API vuelve a exigir sesión y rol de operador o administrador.
 */

export async function crearCuponAccion(
  previo: EstadoFormularioCupon,
  formData: FormData,
): Promise<EstadoFormularioCupon> {
  const api = await clienteApiDeLaSesion();
  const resultado = await procesarCreacionCupon(previo, formData, (solicitud) =>
    crearCupon(api, solicitud),
  );
  if (resultado.tipo === 'creado') {
    redirect(`/operador/cupones/${encodeURIComponent(resultado.id)}?creado=1`);
  }
  return resultado.estado;
}

async function cambiarCupon(
  id: string,
  previo: EstadoAccion,
  lectura: LecturaCambio,
): Promise<EstadoAccion> {
  if (!esIdentificador(id)) return accionFallida(previo, 'Ese cupón no existe.');
  const api = await clienteApiDeLaSesion();
  const estado = await procesarCambioCupon(previo, lectura, (cambio) =>
    actualizarCupon(api, id, cambio),
  );
  // La página se vuelve a pedir a la API para mostrar el estado, la vigencia y el cupo nuevos.
  if (estado.resultado === 'exito') refresh();
  return estado;
}

export async function cambiarEstadoCuponAccion(
  id: string,
  previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return cambiarCupon(id, previo, leerCambioEstado(formData));
}

export async function extenderVigenciaAccion(
  id: string,
  previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return cambiarCupon(id, previo, leerExtension(formData));
}

export async function ampliarCupoAccion(
  id: string,
  previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return cambiarCupon(id, previo, leerAmpliacion(formData));
}
