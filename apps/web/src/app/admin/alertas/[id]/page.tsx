import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DetalleAlerta } from '@/components/alertas/detalle-alerta';
import { PanelResolucion } from '@/components/alertas/panel-resolucion';
import { Cargando } from '@/components/comun/cargando';
import { EstadoAcceso } from '@/components/comun/estado-acceso';
import { Hoja, type Miga } from '@/components/comun/hoja';
import { NOMBRE_REGLA } from '@/lib/alertas/textos';
import { esIdentificador } from '@/lib/parametros';
import { obtenerAlerta } from '@/lib/servidor/promociones';
import { clienteApiDeLaSesion } from '@/lib/servidor/sesion';
import { resolverAlertaAccion } from '../acciones';

export const metadata: Metadata = { title: 'Alerta de fraude | Apuestas deportivas' };

const MIGAS: readonly Miga[] = [{ texto: 'Alertas de fraude', href: '/admin/alertas' }];

/** La hoja entera depende de la alerta (su regla es el título), así que se transmite completa. */
async function ContenidoAlerta({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esIdentificador(id)) notFound();
  const resultado = await obtenerAlerta(await clienteApiDeLaSesion(), id);
  if (resultado.tipo === 'rechazo' && resultado.estado === 404) notFound();
  if (resultado.tipo !== 'ok') {
    return (
      <Hoja seccion="Administrador" titulo="Alerta de fraude" migas={MIGAS}>
        <EstadoAcceso
          fallo={resultado}
          rol="administrador"
          que="la alerta"
          reintentarHref={`/admin/alertas/${encodeURIComponent(id)}`}
        />
      </Hoja>
    );
  }
  const alerta = resultado.datos;
  return (
    <Hoja seccion="Administrador" titulo={NOMBRE_REGLA[alerta.regla]} migas={MIGAS}>
      <DetalleAlerta alerta={alerta} />
      <PanelResolucion alerta={alerta} accion={resolverAlertaAccion.bind(null, alerta.id)} />
    </Hoja>
  );
}

export default function PaginaAlerta({ params }: PageProps<'/admin/alertas/[id]'>) {
  return (
    <Suspense
      fallback={
        <Hoja seccion="Administrador" titulo="Alerta de fraude" migas={MIGAS}>
          <Cargando texto="Consultando la alerta…" />
        </Hoja>
      }
    >
      <ContenidoAlerta params={params} />
    </Suspense>
  );
}
