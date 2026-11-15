import { ESTADOS_CUPON, TIPOS_CUPON } from '@apuestas/shared';
import Link from 'next/link';
import { BOTON_SECUNDARIO, CAMPO, ENLACE, ETIQUETA_CAMPO } from '@/components/comun/estilos';
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
      className="bg-papel-hondo -mx-4 mb-2 grid gap-3 px-4 py-4 sm:-mx-8 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end sm:px-8"
    >
      <div>
        <label htmlFor="filtro-busqueda" className={ETIQUETA_CAMPO}>
          Código
        </label>
        <input
          id="filtro-busqueda"
          name="busqueda"
          type="search"
          defaultValue={filtros.busqueda ?? ''}
          placeholder="Empieza por…"
          maxLength={20}
          autoComplete="off"
          className={CAMPO}
        />
      </div>
      <div>
        <label htmlFor="filtro-estado" className={ETIQUETA_CAMPO}>
          Estado
        </label>
        <select
          id="filtro-estado"
          name="estado"
          defaultValue={filtros.estado ?? ''}
          className={CAMPO}
        >
          <option value="">Todos</option>
          {ESTADOS_CUPON.map((estado) => (
            <option key={estado} value={estado}>
              {NOMBRE_ESTADO[estado]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filtro-tipo" className={ETIQUETA_CAMPO}>
          Tipo
        </label>
        <select id="filtro-tipo" name="tipo" defaultValue={filtros.tipo ?? ''} className={CAMPO}>
          <option value="">Todos</option>
          {TIPOS_CUPON.map((tipo) => (
            <option key={tipo} value={tipo}>
              {NOMBRE_TIPO[tipo]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" className={BOTON_SECUNDARIO}>
          Filtrar cupones
        </button>
        <Link href="/operador/cupones" className={ENLACE}>
          Quitar filtros
        </Link>
      </div>
    </form>
  );
}
