import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Cargando } from '@/components/comun/cargando';
import { EstadoAcceso } from '@/components/comun/estado-acceso';
import { BOTON_EN_FRANJA } from '@/components/comun/estilos';
import { Hoja } from '@/components/comun/hoja';
import { Paginacion } from '@/components/comun/paginacion';
import { FiltrosCupones } from '@/components/cupones/filtros-cupones';
import { ListaCupones } from '@/components/cupones/lista-cupones';
import { hayFiltrosCupones, hrefCupones, leerFiltrosCupones } from '@/lib/cupones/filtros';
import type { ParametrosBusqueda } from '@/lib/parametros';
import { listarCupones } from '@/lib/servidor/promociones';
import { clienteApiDeLaSesion } from '@/lib/servidor/sesion';

export const metadata: Metadata = {
  title: 'Cupones | Apuestas deportivas',
  description: 'Gestión de cupones de bono, apuesta gratis y aumento de cuota.',
};

const ROL = 'operador o administrador';

/** Lee la URL y la sesión en la petición, por eso va dentro de `<Suspense>`. */
async function ContenidoCupones({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBusqueda>;
}) {
  const filtros = leerFiltrosCupones(await searchParams);
  const resultado = await listarCupones(await clienteApiDeLaSesion(), filtros);
  if (resultado.tipo !== 'ok') {
    const aviso = (
      <EstadoAcceso
        fallo={resultado}
        rol={ROL}
        que="los cupones"
        reintentarHref={hrefCupones(filtros, filtros.pagina)}
      />
    );
    // Sin sesión o sin rol no se muestran ni los filtros: no hay nada que filtrar.
    if (resultado.tipo === 'sin-sesion' || resultado.tipo === 'sin-permiso') return aviso;
    return (
      <>
        <FiltrosCupones filtros={filtros} />
        {aviso}
      </>
    );
  }
  const { datos, total, pagina, tamano } = resultado.datos;
  return (
    <>
      <FiltrosCupones filtros={filtros} />
      <ListaCupones cupones={datos} hayFiltros={hayFiltrosCupones(filtros)} />
      {total > 0 && (
        <Paginacion
          pagina={pagina}
          tamano={tamano}
          total={total}
          hrefDePagina={(numero) => hrefCupones(filtros, numero)}
          elementos="cupones"
        />
      )}
    </>
  );
}

export default function PaginaCupones({ searchParams }: PageProps<'/operador/cupones'>) {
  return (
    <Hoja
      seccion="Operador"
      titulo="Cupones"
      descripcion="Del más reciente al más antiguo. Un cupón pausado, agotado o fuera de vigencia no acepta canjes nuevos."
      accion={
        <Link href="/operador/cupones/nuevo" className={BOTON_EN_FRANJA}>
          Crear cupón
        </Link>
      }
    >
      <Suspense fallback={<Cargando texto="Consultando los cupones…" />}>
        <ContenidoCupones searchParams={searchParams} />
      </Suspense>
    </Hoja>
  );
}
