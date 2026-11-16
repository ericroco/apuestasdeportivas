'use client';

import type { ApuestaDto, ApuestaLiquidadaPayload } from '@apuestas/shared';
import { EVENTOS_TIEMPO_REAL } from '@apuestas/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SesionVencida } from '@/lib/api-cliente';
import { formatearFechaHora, formatearMonto } from '@/lib/formato';
import { misApuestas } from '@/lib/partidos/api';
import { NOMBRE_ESTADO_APUESTA } from '@/lib/partidos/textos';
import { useTiempoReal } from '@/lib/tiempo-real';

const COLOR_ESTADO: Record<ApuestaDto['estado'], string> = {
  PENDIENTE: 'text-tinta-suave',
  GANADA: 'text-ok',
  PERDIDA: 'text-falla',
  ANULADA: 'text-aviso',
};

/**
 * HU2 y HU3: "Mis apuestas" con estado, selecciones, monto, cuota congelada y premio (FR-023). Cuando se liquida
 * una apuesta, el aviso llega por WebSocket y la fila cambia sin recargar (FR-029, SC-001).
 */
export default function PaginaMisApuestas() {
  const [apuestas, setApuestas] = useState<ApuestaDto[] | null>(null);
  const [error, setError] = useState<{ mensaje: string; sesion: boolean } | null>(null);
  const [recienLiquidadas, setRecienLiquidadas] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let vigente = true;
    misApuestas()
      .then((pagina) => vigente && setApuestas(pagina.elementos))
      .catch(
        (e: unknown) =>
          vigente &&
          setError({
            mensaje: e instanceof Error ? e.message : 'No se pudieron cargar tus apuestas.',
            sesion: e instanceof SesionVencida,
          }),
      );
    return () => {
      vigente = false;
    };
  }, []);

  useTiempoReal({
    [EVENTOS_TIEMPO_REAL.apuestaLiquidada]: (aviso: ApuestaLiquidadaPayload) => {
      setApuestas((lista) =>
        (lista ?? []).map((a) =>
          a.id === aviso.apuestaId
            ? {
                ...a,
                estado: aviso.estado,
                premioPagado: aviso.premio,
                liquidadaEn: aviso.liquidadaEn,
              }
            : a,
        ),
      );
      setRecienLiquidadas((ids) => new Set(ids).add(aviso.apuestaId));
    },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-papel font-display mb-5 text-5xl leading-none font-bold">Mis apuestas</h1>
      {error && (
        <p role="alert" className="bg-papel text-falla rounded-md px-4 py-3">
          {error.mensaje}{' '}
          {error.sesion && (
            <Link href="/iniciar-sesion" className="underline">
              Iniciar sesión
            </Link>
          )}
        </p>
      )}
      {!error && apuestas === null && <p className="text-papel">Cargando tus apuestas…</p>}
      {apuestas?.length === 0 && (
        <p className="bg-papel rounded-md px-4 py-3">
          Todavía no apostaste.{' '}
          <Link href="/partidos" className="font-semibold underline">
            Ir a la cartelera
          </Link>
        </p>
      )}
      <ul className="space-y-3">
        {apuestas?.map((a) => (
          <li
            key={a.id}
            className={`bg-papel rounded-lg px-4 py-3 ${recienLiquidadas.has(a.id) ? 'outline-franja outline-4' : ''}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {a.tipo === 'COMBINADA' ? `Combinada de ${a.selecciones.length}` : 'Simple'}
                {a.enVivo ? ' en vivo' : ''} · {formatearMonto(a.monto)} a cuota {a.cuotaTotal}
              </p>
              <p aria-live="polite" className={`font-semibold ${COLOR_ESTADO[a.estado]}`}>
                {NOMBRE_ESTADO_APUESTA[a.estado]}
                {a.estado === 'GANADA' ? ` · cobraste ${formatearMonto(a.premioPagado)}` : ''}
              </p>
            </div>
            <p className="text-tinta-suave text-sm">
              Aceptada el {formatearFechaHora(a.aceptadaEn)}
              {a.estado === 'PENDIENTE' ? ` · ganarías ${formatearMonto(a.gananciaPotencial)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
