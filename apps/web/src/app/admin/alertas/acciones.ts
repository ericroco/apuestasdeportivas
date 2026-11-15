'use server';

import { refresh } from 'next/cache';
import { accionFallida, type EstadoAccion } from '@/lib/acciones';
import { procesarResolucion } from '@/lib/alertas/resolucion';
import { esIdentificador } from '@/lib/parametros';
import { resolverAlerta } from '@/lib/servidor/promociones';
import { clienteApiDeLaSesion } from '@/lib/servidor/sesion';

/**
 * Resolver una alerta. Se puede invocar con un POST directo: valida la entrada y la API vuelve a exigir
 * sesión y rol de administrador, y deja la resolución en la auditoría.
 */
export async function resolverAlertaAccion(
  id: string,
  previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  if (!esIdentificador(id)) return accionFallida(previo, 'Esa alerta no existe.');
  const api = await clienteApiDeLaSesion();
  let consultoLaApi = false;
  const estado = await procesarResolucion(previo, formData, (solicitud) => {
    consultoLaApi = true;
    return resolverAlerta(api, id, solicitud);
  });
  // Resuelta por ti o por otra persona a la vez: se vuelve a pedir la alerta para mostrar lo vigente.
  if (consultoLaApi) refresh();
  return estado;
}
