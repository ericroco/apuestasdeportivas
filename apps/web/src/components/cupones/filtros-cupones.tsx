import { ESTADOS_CUPON, TIPOS_CUPON } from '@apuestas/shared';
import { AccionesFiltro, CampoFiltro, Selector } from '@/components/comun/campos-filtro';
import type { FiltrosCupones as Filtros } from '@/lib/cupones/filtros';
import { NOMBRE_ESTADO, NOMBRE_TIPO } from '@/lib/cupones/textos';

interface FiltrosCuponesProps {
  readonly filtros: Filtros;
}

/**
 * Filtros en la URL (`?estado=&tipo=&busqueda=`) para compartir la vista. Es un formulario GET: funciona
 * sin JavaScript y al filtrar vuelve a la primera página.
 */
export function FiltrosCupones({ filtros }: FiltrosCuponesProps) {
  return (
    <form
      method="get"
      action="/operador/cupones"
      aria-label="Filtrar cupones"
      className="bg-papel-hondo -mx-4 mb-2 grid gap-3 px-4 py-4 sm:-mx-8 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:px-8"
    >
      <CampoFiltro
        id="filtro-busqueda"
        nombre="busqueda"
        etiqueta="Código"
        valor={filtros.busqueda}
        tipo="search"
        placeholder="Empieza por…"
        largoMaximo={20}
      />
      <Selector
        id="filtro-estado"
        nombre="estado"
        etiqueta="Estado"
        valor={filtros.estado}
        opciones={ESTADOS_CUPON}
        nombres={NOMBRE_ESTADO}
        todos="Todos"
      />
      <Selector
        id="filtro-tipo"
        nombre="tipo"
        etiqueta="Tipo"
        valor={filtros.tipo}
        opciones={TIPOS_CUPON}
        nombres={NOMBRE_TIPO}
        todos="Todos"
      />
      <AccionesFiltro texto="Filtrar cupones" limpiar="/operador/cupones" />
    </form>
  );
}
