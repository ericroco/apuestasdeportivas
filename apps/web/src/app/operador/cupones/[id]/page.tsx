import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Cargando } from '@/components/comun/cargando';
import { EstadoAcceso } from '@/components/comun/estado-acceso';
import { Hoja, type Miga } from '@/components/comun/hoja';
import { AccionesCupon } from '@/components/cupones/acciones-cupon';
import { DetalleCupon } from '@/components/cupones/detalle-cupon';
import { esIdentificador, primerValor, type ParametrosBusqueda } from '@/lib/parametros';
import { obtenerCupon } from '@/lib/servidor/promociones';
import { clienteApiDeLaSesion } from '@/lib/servidor/sesion';
import { ampliarCupoAccion, cambiarEstadoCuponAccion, extenderVigenciaAccion } from '../acciones';

export const metadata: Metadata = { title: 'Cupón | Apuestas deportivas' };

const MIGAS: readonly Miga[] = [{ texto: 'Cupones', href: '/operador/cupones' }];

interface ContenidoProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<ParametrosBusqueda>;
}

/** La hoja entera depende del cupón (su código es el título), así que se transmite completa. */
async function ContenidoCupon({ params, searchParams }: ContenidoProps) {
  const { id } = await params;
  if (!esIdentificador(id)) notFound();
  const recienCreado = primerValor(await searchParams, 'creado') === '1';
  const resultado = await obtenerCupon(await clienteApiDeLaSesion(), id);
  if (resultado.tipo === 'rechazo' && resultado.estado === 404) notFound();
  if (resultado.tipo !== 'ok') {
    return (
      <Hoja seccion="Operador" titulo="Cupón" migas={MIGAS}>
        <EstadoAcceso
          fallo={resultado}
          rol="operador o administrador"
          que="el cupón"
          reintentarHref={`/operador/cupones/${encodeURIComponent(id)}`}
        />
      </Hoja>
    );
  }
  const cupon = resultado.datos;
  return (
    <Hoja seccion="Operador" titulo={cupon.codigo} migas={MIGAS}>
      <DetalleCupon cupon={cupon} />
      {recienCreado && (
        <p role="status" className="text-ok mt-4 font-semibold">
          Cupón creado. Ya aparece en la lista con {cupon.canjes} canjes.
        </p>
      )}
      <AccionesCupon
        cupon={cupon}
        cambiarEstado={cambiarEstadoCuponAccion.bind(null, cupon.id)}
        extenderVigencia={extenderVigenciaAccion.bind(null, cupon.id)}
        ampliarCupo={ampliarCupoAccion.bind(null, cupon.id)}
      />
    </Hoja>
  );
}

export default function PaginaCupon({ params, searchParams }: PageProps<'/operador/cupones/[id]'>) {
  return (
    <Suspense
      fallback={
        <Hoja seccion="Operador" titulo="Cupón" migas={MIGAS}>
          <Cargando texto="Consultando el cupón…" />
        </Hoja>
      }
    >
      <ContenidoCupon params={params} searchParams={searchParams} />
    </Suspense>
  );
}
