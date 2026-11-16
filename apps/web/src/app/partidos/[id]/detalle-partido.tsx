'use client';

import type { PartidoActualizadoPayload, PartidoDetalleDto } from '@apuestas/shared';
import { EVENTOS_TIEMPO_REAL } from '@apuestas/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useBoleto } from '@/components/boleto/contexto-boleto';
import { formatearFechaHora } from '@/lib/formato';
import { obtenerPartido } from '@/lib/partidos/api';
import { NOMBRE_ESTADO_PARTIDO, nombreMercado, nombreSeleccion } from '@/lib/partidos/textos';
import { useTiempoReal } from '@/lib/tiempo-real';

/**
 * HU1 y HU3: detalle del partido con sus mercados y cuotas vigentes. El marcador, el estado y las cuotas se
 * actualizan en vivo sin recargar (FR-029); un cambio de estado o de mercado vuelve a pedir el detalle completo.
 */
export function DetallePartido() {
  const { id } = useParams<{ id: string }>();
  const { selecciones, despachar } = useBoleto();
  const [partido, setPartido] = useState<PartidoDetalleDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    obtenerPartido(id)
      .then(setPartido)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo cargar el partido.'),
      );
  }, [id]);

  useEffect(cargar, [cargar]);

  useTiempoReal(
    {
      [EVENTOS_TIEMPO_REAL.partidoActualizado]: (cambio: PartidoActualizadoPayload) => {
        // El estado arrastra cambios en los mercados (cierre al empezar, suspensión): se recarga todo.
        if (partido && cambio.estado !== partido.estado) return cargar();
        setPartido((actual) =>
          actual ? { ...actual, ...cambio, version: cambio.version } : actual,
        );
      },
      [EVENTOS_TIEMPO_REAL.mercadoActualizado]: () => cargar(),
    },
    [id],
  );

  if (error) {
    return (
      <p role="alert" className="bg-papel text-falla rounded-md px-4 py-3">
        {error}{' '}
        <Link href="/partidos" className="underline">
          Volver a la cartelera
        </Link>
      </p>
    );
  }
  if (!partido) return <p className="text-papel">Cargando el partido…</p>;

  const elegidas = new Set(selecciones.map((s) => s.seleccionId));
  const enJuego = partido.estado === 'EN_VIVO' || partido.estado === 'SUSPENDIDO';
  const titulo = `${partido.nombreLocal} vs ${partido.nombreVisitante}`;

  return (
    <main>
      <Link href="/partidos" className="text-papel text-sm underline underline-offset-4">
        Cartelera
      </Link>
      <header className="text-papel mt-3 mb-5">
        <p className="text-franja font-semibold">{partido.competicion.nombre}</p>
        <h1 className="font-display text-4xl leading-tight font-bold sm:text-5xl">{titulo}</h1>
        <p aria-live="polite" className="mt-2 flex flex-wrap items-baseline gap-x-4">
          {enJuego || partido.estado === 'FINALIZADO' ? (
            <span className="font-display text-5xl font-bold tabular-nums">
              {partido.golesLocal ?? 0}–{partido.golesVisitante ?? 0}
            </span>
          ) : null}
          <span>
            {partido.estado === 'PROGRAMADO'
              ? formatearFechaHora(partido.inicioEn)
              : NOMBRE_ESTADO_PARTIDO[partido.estado]}
            {partido.estado === 'EN_VIVO' && partido.minuto !== null
              ? ` · minuto ${partido.minuto}`
              : ''}
          </span>
        </p>
      </header>

      {partido.mercados.length === 0 && (
        <p className="bg-papel rounded-md px-4 py-3">Este partido todavía no tiene cuotas.</p>
      )}

      {partido.mercados.map((mercado) => {
        const abierto = mercado.estado === 'ABIERTO';
        const nombre = nombreMercado(mercado.tipo, mercado.linea);
        return (
          <section
            key={mercado.id}
            aria-label={nombre}
            className="bg-papel mb-3 rounded-lg px-4 py-3"
          >
            <h2 className="mb-2 flex items-center justify-between font-semibold">
              {nombre}
              {!abierto && (
                <span className="text-tinta-suave text-sm font-normal">
                  {mercado.estado === 'SUSPENDIDO' ? 'Suspendido' : 'Cerrado'}
                </span>
              )}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
              {mercado.selecciones.map((s) => {
                const texto = nombreSeleccion(
                  s.codigo,
                  partido.nombreLocal,
                  partido.nombreVisitante,
                  mercado.linea,
                );
                const elegida = elegidas.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!abierto}
                    aria-pressed={elegida}
                    onClick={() =>
                      despachar({
                        tipo: 'alternar',
                        seleccion: {
                          seleccionId: s.id,
                          partidoId: partido.id,
                          partido: titulo,
                          mercado: nombre,
                          nombre: texto,
                          cuota: s.cuota,
                        },
                      })
                    }
                    className="border-tinta aria-pressed:bg-tinta aria-pressed:text-papel hover:bg-franja flex items-center justify-between gap-2 rounded-md border-2 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-sm leading-tight">{texto}</span>
                    <span className="font-display text-xl font-bold tabular-nums">{s.cuota}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
