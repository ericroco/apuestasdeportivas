import type { Metadata } from 'next';
import { io } from 'next/cache';
import { Suspense } from 'react';
import { Cargando } from '@/components/comun/cargando';
import { EstadoAcceso } from '@/components/comun/estado-acceso';
import { Hoja } from '@/components/comun/hoja';
import { FiltrosReporte } from '@/components/reportes/filtros-reporte';
import { ErroresFiltros, Tablero } from '@/components/reportes/tablero';
import type { ParametrosBusqueda } from '@/lib/parametros';
import { hoyUtc, hrefReportes, leerFiltrosReporte } from '@/lib/reportes/filtros';
import { obtenerTablero } from '@/lib/servidor/reportes';
import { clienteReportesDeLaSesion, leerTokenAcceso } from '@/lib/servidor/sesion';

export const metadata: Metadata = {
  title: 'Reportes | Apuestas deportivas',
  description: 'Volumen apostado, GGR, pagos, cupones y alertas del periodo, con exportación.',
};

const ROL = 'administrador';

/** Lee la URL, la sesión y la fecha de hoy en la petición, por eso va dentro de `<Suspense>`. */
async function ContenidoReportes({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBusqueda>;
}) {
  const parametros = await searchParams;
  if ((await leerTokenAcceso()) === null) {
    return (
      <EstadoAcceso
        fallo={{ tipo: 'sin-sesion' }}
        rol={ROL}
        que="los reportes"
        reintentarHref="/admin/reportes"
      />
    );
  }
  await io();
  const hoy = hoyUtc();
  const lectura = leerFiltrosReporte(parametros, hoy);
  if (!lectura.ok) {
    return (
      <>
        <FiltrosReporte filtros={lectura.filtros} hoy={hoy} />
        <ErroresFiltros errores={lectura.errores} />
      </>
    );
  }
  const resultado = await obtenerTablero(await clienteReportesDeLaSesion(), lectura.filtros);
  if (resultado.tipo === 'ok') {
    return <Tablero tablero={resultado.datos} filtros={lectura.filtros} hoy={hoy} />;
  }
  const aviso = (
    <EstadoAcceso
      fallo={resultado}
      rol={ROL}
      que="los reportes"
      reintentarHref={hrefReportes(lectura.filtros)}
    />
  );
  if (resultado.tipo === 'sin-sesion' || resultado.tipo === 'sin-permiso') return aviso;
  return (
    <>
      <FiltrosReporte filtros={lectura.filtros} hoy={hoy} />
      {aviso}
    </>
  );
}

export default function PaginaReportes({ searchParams }: PageProps<'/admin/reportes'>) {
  return (
    <Hoja
      seccion="Administrador"
      titulo="Reportes"
      descripcion="Cifras que calcula el servicio de reportes en cada consulta. Si no responde, no se muestran cifras anteriores."
    >
      <Suspense fallback={<Cargando texto="Calculando el reporte…" />}>
        <ContenidoReportes searchParams={searchParams} />
      </Suspense>
    </Hoja>
  );
}
