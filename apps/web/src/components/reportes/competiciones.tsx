import Link from 'next/link';
import { ENLACE } from '@/components/comun/estilos';
import { formatearEntero, formatearMonto } from '@/lib/formato';
import { hrefReportes, type FiltrosReporte } from '@/lib/reportes/filtros';
import type { CompeticionReporte } from '@/lib/servidor/esquemas-reportes';

interface CompeticionesProps {
  readonly competiciones: readonly CompeticionReporte[];
  readonly filtros: FiltrosReporte;
}

const COLUMNAS = 'md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)]';

function Fila({
  competicion,
  filtros,
}: {
  readonly competicion: CompeticionReporte;
  readonly filtros: FiltrosReporte;
}) {
  const filtrada = filtros.competicionId === competicion.competicionId;
  return (
    <li className={`grid grid-cols-3 gap-x-4 gap-y-1 py-3 ${COLUMNAS} md:items-baseline`}>
      <div className="col-span-3 md:col-span-1">
        <p className="font-semibold break-words">{competicion.nombre}</p>
        {competicion.deporte && <p className="text-tinta-suave text-sm">{competicion.deporte}</p>}
      </div>
      <dl className="col-span-3 grid grid-cols-subgrid">
        <div className="md:text-right">
          <dt className="text-tinta-suave text-sm md:sr-only">Apuestas</dt>
          <dd className="tabular-nums">{formatearEntero(competicion.apuestas)}</dd>
        </div>
        <div className="md:text-right">
          <dt className="text-tinta-suave text-sm md:sr-only">Volumen</dt>
          <dd className="tabular-nums">{formatearMonto(competicion.volumen)}</dd>
        </div>
        <div className="md:text-right">
          <dt className="text-tinta-suave text-sm md:sr-only">GGR</dt>
          <dd className="tabular-nums">{formatearMonto(competicion.ggr)}</dd>
        </div>
      </dl>
      <p className="col-span-3 md:col-span-1 md:text-right">
        {filtrada ? (
          <span className="text-tinta-suave text-sm">Filtro aplicado</span>
        ) : (
          <Link
            href={hrefReportes({ ...filtros, competicionId: competicion.competicionId })}
            className={`${ENLACE} text-sm`}
          >
            Ver solo esta competición
          </Link>
        )}
      </p>
    </li>
  );
}

/** Desglose por competición, de mayor a menor volumen (el orden y el máximo de 20 los fija reportes). */
export function Competiciones({ competiciones, filtros }: CompeticionesProps) {
  return (
    <section aria-labelledby="titulo-competiciones" className="mt-10">
      <h2 id="titulo-competiciones" className="font-display text-3xl font-bold">
        Desglose por competición
      </h2>
      {competiciones.length === 0 ? (
        <p className="mt-2">Ninguna competición tuvo apuestas en este periodo.</p>
      ) : (
        <div className="mt-2">
          <div
            aria-hidden="true"
            className={`text-tinta-suave border-tinta hidden gap-x-4 border-b-2 pb-2 text-sm font-semibold md:grid ${COLUMNAS}`}
          >
            <span>Competición</span>
            <span className="text-right">Apuestas</span>
            <span className="text-right">Volumen</span>
            <span className="text-right">GGR</span>
            <span />
          </div>
          <ul aria-label="Competiciones" className="divide-perforado divide-y-2 divide-dashed">
            {competiciones.map((competicion) => (
              <Fila key={competicion.competicionId} competicion={competicion} filtros={filtros} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
