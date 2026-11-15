import { ESTADOS_ALERTA, REGLAS_FRAUDE, SEVERIDADES_ALERTA } from '@apuestas/shared';
import { AccionesFiltro, CampoFiltro, Selector } from '@/components/comun/campos-filtro';
import type { FiltrosAlertas as Filtros } from '@/lib/alertas/filtros';
import { NOMBRE_ESTADO_ALERTA, NOMBRE_REGLA, NOMBRE_SEVERIDAD } from '@/lib/alertas/textos';

interface FiltrosAlertasProps {
  readonly filtros: Filtros;
}

function Selectores({ filtros }: FiltrosAlertasProps) {
  return (
    <>
      <Selector
        id="filtro-estado"
        nombre="estado"
        etiqueta="Estado"
        valor={filtros.estado}
        opciones={ESTADOS_ALERTA}
        nombres={NOMBRE_ESTADO_ALERTA}
        todos="Todas"
      />
      <Selector
        id="filtro-severidad"
        nombre="severidad"
        etiqueta="Severidad"
        valor={filtros.severidad}
        opciones={SEVERIDADES_ALERTA}
        nombres={NOMBRE_SEVERIDAD}
        todos="Todas"
      />
      <Selector
        id="filtro-regla"
        nombre="regla"
        etiqueta="Regla"
        valor={filtros.regla}
        opciones={REGLAS_FRAUDE}
        nombres={NOMBRE_REGLA}
        todos="Todas"
      />
    </>
  );
}

/** Filtros en la URL (`?estado=&severidad=&regla=&usuarioId=&desde=&hasta=`), con un GET sin JavaScript. */
export function FiltrosAlertas({ filtros }: FiltrosAlertasProps) {
  return (
    <form
      method="get"
      action="/admin/alertas"
      aria-label="Filtrar alertas"
      className="bg-papel-hondo -mx-4 mb-2 grid gap-3 px-4 py-4 sm:-mx-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-3"
    >
      <Selectores filtros={filtros} />
      <CampoFiltro
        id="filtro-usuario"
        nombre="usuarioId"
        etiqueta="Usuario (identificador)"
        valor={filtros.usuarioId}
        tipo="search"
      />
      <div className="grid grid-cols-2 gap-3">
        <CampoFiltro
          id="filtro-desde"
          nombre="desde"
          etiqueta="Desde"
          valor={filtros.desde}
          tipo="date"
        />
        <CampoFiltro
          id="filtro-hasta"
          nombre="hasta"
          etiqueta="Hasta"
          valor={filtros.hasta}
          tipo="date"
        />
      </div>
      <AccionesFiltro texto="Filtrar alertas" limpiar="/admin/alertas" />
    </form>
  );
}
