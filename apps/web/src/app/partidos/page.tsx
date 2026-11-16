'use client';

import type { EstadoPartido, PartidoResumenDto } from '@apuestas/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatearFechaHora } from '@/lib/formato';
import { listarPartidos } from '@/lib/partidos/api';
import { NOMBRE_ESTADO_PARTIDO } from '@/lib/partidos/textos';

const VISTAS: ReadonlyArray<{ estado?: EstadoPartido; nombre: string }> = [
  { nombre: 'Todos' },
  { estado: 'EN_VIVO', nombre: 'En vivo' },
  { estado: 'PROGRAMADO', nombre: 'Por jugarse' },
];

/** HU1: cartelera de próximos partidos y partidos en vivo, agrupada por competición (FR-008). */
export default function PaginaCartelera() {
  const [vista, setVista] = useState<EstadoPartido | undefined>(undefined);
  const [partidos, setPartidos] = useState<PartidoResumenDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    listarPartidos(vista ? { estado: vista } : {})
      .then((pagina) => vigente && setPartidos(pagina.elementos))
      .catch(
        (e: unknown) => vigente && setError(e instanceof Error ? e.message : 'No se pudo cargar.'),
      );
    return () => {
      vigente = false;
    };
  }, [vista]);

  const porCompeticion = Map.groupBy(partidos ?? [], (p) => p.competicion.nombre);

  return (
    <main>
      <header className="text-papel mb-5">
        <h1 className="font-display text-5xl leading-none font-bold">Cartelera</h1>
        <nav aria-label="Filtrar partidos" className="mt-4 flex gap-2">
          {VISTAS.map((v) => (
            <button
              key={v.nombre}
              type="button"
              aria-pressed={vista === v.estado}
              onClick={() => {
                setPartidos(null);
                setVista(v.estado);
              }}
              className="border-papel aria-pressed:bg-franja aria-pressed:text-tinta aria-pressed:border-franja rounded-full border px-4 py-1.5 font-semibold"
            >
              {v.nombre}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <p role="alert" className="bg-papel text-falla rounded-md px-4 py-3">
          {error}
        </p>
      )}
      {!error && partidos === null && <p className="text-papel">Cargando partidos…</p>}
      {partidos?.length === 0 && (
        <p className="bg-papel rounded-md px-4 py-3">
          No hay partidos en esta vista. Prueba con “Todos” o vuelve más tarde.
        </p>
      )}

      {[...porCompeticion].map(([competicion, lista]) => (
        <section key={competicion} aria-labelledby={`comp-${competicion}`} className="mb-6">
          <h2
            id={`comp-${competicion}`}
            className="text-franja font-display mb-2 text-2xl font-semibold"
          >
            {competicion}
          </h2>
          <ul className="bg-papel divide-perforado divide-y overflow-hidden rounded-lg">
            {lista.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/partidos/${p.id}`}
                  className="hover:bg-papel-hondo grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3"
                >
                  <span>
                    <span className="block font-semibold">
                      {p.nombreLocal} <span className="text-tinta-suave font-normal">vs</span>{' '}
                      {p.nombreVisitante}
                    </span>
                    <span className="text-tinta-suave text-sm">
                      {p.estado === 'PROGRAMADO'
                        ? formatearFechaHora(p.inicioEn)
                        : NOMBRE_ESTADO_PARTIDO[p.estado]}
                    </span>
                  </span>
                  {p.estado === 'EN_VIVO' ? (
                    <span className="font-display text-falla text-3xl font-bold tabular-nums">
                      {p.golesLocal ?? 0}–{p.golesVisitante ?? 0}
                    </span>
                  ) : (
                    <span className="text-tinta-suave text-sm">Ver cuotas</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
