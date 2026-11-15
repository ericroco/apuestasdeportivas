import { esPeriodoVacio } from '@/lib/reportes/tablero';
import type { FiltrosReporte as Filtros } from '@/lib/reportes/filtros';
import type { Tablero as DatosTablero } from '@/lib/servidor/reportes';
import { Competiciones } from './competiciones';
import { FiltrosReporte } from './filtros-reporte';
import { GraficaSerie } from './grafica-serie';
import { Metricas } from './metricas';

interface TableroProps {
  readonly tablero: DatosTablero;
  readonly filtros: Filtros;
  readonly hoy: string;
}

/** Errores de formato de los filtros: se corrigen antes de consultar a reportes. */
export function ErroresFiltros({ errores }: { readonly errores: readonly string[] }) {
  return (
    <div role="alert" className="border-falla mt-4 border-l-4 pl-3">
      <p className="text-falla font-semibold">Corrige los filtros para ver el reporte:</p>
      <ul className="list-inside list-disc">
        {errores.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

/** Dashboard del periodo: filtros arriba y, debajo, todo lo que esos filtros acotan. */
export function Tablero({ tablero, filtros, hoy }: TableroProps) {
  const { resumen, serie, competiciones } = tablero;
  const nombreCompeticion = competiciones.competiciones.find(
    (competicion) => competicion.competicionId === filtros.competicionId,
  )?.nombre;
  return (
    <>
      <FiltrosReporte filtros={filtros} hoy={hoy} nombreCompeticion={nombreCompeticion} />
      {esPeriodoVacio(resumen) && (
        <p role="status" className="border-tinta mt-6 border-l-4 pl-3">
          <strong className="font-display block text-2xl">Sin datos en este periodo.</strong>
          Las cifras están en cero. Prueba con un rango más amplio o quita algún filtro.
        </p>
      )}
      <Metricas resumen={resumen} />
      <GraficaSerie dias={serie.dias} />
      <Competiciones competiciones={competiciones.competiciones} filtros={filtros} />
    </>
  );
}
