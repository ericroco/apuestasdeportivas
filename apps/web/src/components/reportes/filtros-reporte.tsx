import Link from 'next/link';
import { CampoFiltro } from '@/components/comun/campos-filtro';
import { BOTON_SECUNDARIO, ENLACE } from '@/components/comun/estilos';
import {
  hrefReportes,
  rangoUltimosDias,
  type FiltrosReporte as Filtros,
} from '@/lib/reportes/filtros';

interface FiltrosReporteProps {
  readonly filtros: Filtros;
  /** Hoy en UTC, para los atajos de rango. */
  readonly hoy: string;
  /** Nombre de la competición filtrada, si el desglose lo trae. */
  readonly nombreCompeticion?: string;
}

const ATAJOS = [7, 30, 90] as const;

/** Atajos de rango antes que el calendario: conservan el resto de los filtros. */
function Atajos({ filtros, hoy }: Pick<FiltrosReporteProps, 'filtros' | 'hoy'>) {
  return (
    <nav aria-label="Rangos rápidos" className="flex flex-wrap gap-x-5 gap-y-1">
      {ATAJOS.map((dias) => {
        const rango = rangoUltimosDias(hoy, dias);
        const actual = rango.desde === filtros.desde && rango.hasta === filtros.hasta;
        return (
          <Link
            key={dias}
            href={hrefReportes({ ...filtros, ...rango })}
            aria-current={actual ? 'page' : undefined}
            className={`${ENLACE} aria-[current=page]:no-underline aria-[current=page]:text-tinta-suave`}
          >
            Últimos {dias} días
          </Link>
        );
      })}
    </nav>
  );
}

/** El filtro de competición se elige desde el desglose; aquí se ve y se quita. */
function CompeticionFiltrada({ filtros, nombreCompeticion }: Omit<FiltrosReporteProps, 'hoy'>) {
  if (!filtros.competicionId) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 sm:col-span-2 lg:col-span-4">
      <input type="hidden" name="competicionId" value={filtros.competicionId} />
      <span>
        Solo la competición <strong>{nombreCompeticion ?? filtros.competicionId}</strong>
      </span>
      <Link href={hrefReportes({ ...filtros, competicionId: undefined })} className={ENLACE}>
        Quitar la competición
      </Link>
    </p>
  );
}

/** Filtros en la URL (`?desde=&hasta=&deporte=&competicionId=&usuario=`), en una fila sobre el reporte. */
export function FiltrosReporte({ filtros, hoy, nombreCompeticion }: FiltrosReporteProps) {
  return (
    <form
      method="get"
      action="/admin/reportes"
      aria-label="Filtrar el reporte"
      className="bg-papel-hondo -mx-4 flex flex-col gap-3 px-4 py-4 sm:-mx-8 sm:px-8"
    >
      <Atajos filtros={filtros} hoy={hoy} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] lg:items-end">
        <CampoFiltro
          id="reporte-desde"
          nombre="desde"
          etiqueta="Desde"
          valor={filtros.desde}
          tipo="date"
          requerido
        />
        <CampoFiltro
          id="reporte-hasta"
          nombre="hasta"
          etiqueta="Hasta"
          valor={filtros.hasta}
          tipo="date"
          requerido
        />
        <CampoFiltro
          id="reporte-deporte"
          nombre="deporte"
          etiqueta="Deporte"
          valor={filtros.deporte}
          tipo="search"
          largoMaximo={254}
        />
        <CampoFiltro
          id="reporte-usuario"
          nombre="usuario"
          etiqueta="Usuario (identificador o correo)"
          valor={filtros.usuario}
          tipo="search"
          largoMaximo={254}
        />
        <button type="submit" className={BOTON_SECUNDARIO}>
          Ver reporte
        </button>
        <CompeticionFiltrada filtros={filtros} nombreCompeticion={nombreCompeticion} />
      </div>
      <p className="text-tinta-suave text-sm">Días en UTC, ambos incluidos. Hasta 366 días.</p>
    </form>
  );
}
