import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FiltrosAlertas } from '@/components/alertas/filtros-alertas';
import { ListaAlertas } from '@/components/alertas/lista-alertas';
import { Cargando } from '@/components/comun/cargando';
import { EstadoAcceso } from '@/components/comun/estado-acceso';
import { Hoja } from '@/components/comun/hoja';
import { Paginacion } from '@/components/comun/paginacion';
import { hayFiltrosAlertas, hrefAlertas, leerFiltrosAlertas } from '@/lib/alertas/filtros';
import type { ParametrosBusqueda } from '@/lib/parametros';
import { listarAlertas } from '@/lib/servidor/promociones';
import { clienteApiDeLaSesion } from '@/lib/servidor/sesion';

export const metadata: Metadata = {
  title: 'Alertas de fraude | Apuestas deportivas',
  description: 'Alertas de cuentas múltiples, apuestas anómalas y retiros para revisión.',
};

const ROL = 'administrador';

/** Lee la URL y la sesión en la petición, por eso va dentro de `<Suspense>`. */
async function ContenidoAlertas({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBusqueda>;
}) {
  const filtros = leerFiltrosAlertas(await searchParams);
  const resultado = await listarAlertas(await clienteApiDeLaSesion(), filtros);
  if (resultado.tipo !== 'ok') {
    const aviso = (
      <EstadoAcceso
        fallo={resultado}
        rol={ROL}
        que="las alertas"
        reintentarHref={hrefAlertas(filtros, filtros.pagina)}
      />
    );
    if (resultado.tipo === 'sin-sesion' || resultado.tipo === 'sin-permiso') return aviso;
    return (
      <>
        <FiltrosAlertas filtros={filtros} />
        {aviso}
      </>
    );
  }
  const { datos, total, pagina, tamano } = resultado.datos;
  return (
    <>
      <FiltrosAlertas filtros={filtros} />
      <ListaAlertas alertas={datos} hayFiltros={hayFiltrosAlertas(filtros)} />
      {total > 0 && (
        <Paginacion
          pagina={pagina}
          tamano={tamano}
          total={total}
          hrefDePagina={(numero) => hrefAlertas(filtros, numero)}
          elementos="alertas"
        />
      )}
    </>
  );
}

export default function PaginaAlertas({ searchParams }: PageProps<'/admin/alertas'>) {
  return (
    <Hoja
      seccion="Administrador"
      titulo="Alertas de fraude"
      descripcion="Una alerta no bloquea la cuenta: con una alerta alta abierta o confirmada, los retiros del usuario van a revisión y no puede usar cupones de bono."
    >
      <Suspense fallback={<Cargando texto="Consultando las alertas…" />}>
        <ContenidoAlertas searchParams={searchParams} />
      </Suspense>
    </Hoja>
  );
}
