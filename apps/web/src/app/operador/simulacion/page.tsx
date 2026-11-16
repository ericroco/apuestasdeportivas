'use client';

import type { PartidoResumenDto } from '@apuestas/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Tarjeta } from '@/components/ui';
import { listarPartidos, operador } from '@/lib/partidos/api';
import { NOMBRE_ESTADO_PARTIDO } from '@/lib/partidos/textos';

type Evento = { tipo: string; nombre: string; equipo?: 'LOCAL' | 'VISITANTE' };

/** Eventos que tienen sentido en cada estado (la API valida igual con la máquina de estados). */
function eventosPara(partido: PartidoResumenDto): Evento[] {
  switch (partido.estado) {
    case 'PROGRAMADO':
      return [
        { tipo: 'INICIO', nombre: 'Pitazo inicial' },
        { tipo: 'APLAZAMIENTO', nombre: 'Aplazar' },
      ];
    case 'EN_VIVO':
      return [
        { tipo: 'GOL', nombre: `Gol de ${partido.nombreLocal}`, equipo: 'LOCAL' },
        { tipo: 'GOL', nombre: `Gol de ${partido.nombreVisitante}`, equipo: 'VISITANTE' },
        { tipo: 'SUSPENSION', nombre: 'Suspender' },
        { tipo: 'FINAL', nombre: 'Pitazo final' },
      ];
    case 'SUSPENDIDO':
      return [
        { tipo: 'REANUDACION', nombre: 'Reanudar' },
        { tipo: 'CANCELACION', nombre: 'Cancelar' },
      ];
    default:
      return [];
  }
}

/**
 * HU5 (T037): simulación de partidos para la demo, sin conectarse al proveedor (FR-013, SC-008). Cada evento pasa
 * por el mismo camino que un dato de API-Football: el pitazo final liquida las apuestas. Solo existe con
 * API_FOOTBALL_SIMULACION=true; con el proveedor real la API responde 404 y aquí se muestra ese aviso.
 */
export default function PaginaSimulacion() {
  const [partidos, setPartidos] = useState<PartidoResumenDto[]>([]);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    listarPartidos()
      .then((pagina) => setPartidos(pagina.elementos))
      .catch((e: unknown) =>
        setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error' }),
      );
  }, []);
  useEffect(cargar, [cargar]);

  async function simular(partido: PartidoResumenDto, evento: Evento) {
    setOcupado(true);
    try {
      const actualizado = await operador.simular(partido.id, evento.tipo, evento.equipo);
      setAviso({
        tipo: 'exito',
        texto: `${evento.nombre}: ${actualizado.nombreLocal} ${actualizado.golesLocal ?? 0}–${actualizado.golesVisitante ?? 0} ${actualizado.nombreVisitante}.`,
      });
      cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo simular.' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta antetitulo="Operador" titulo="Simular partidos" ancho="max-w-3xl">
      <Link href="/operador/partidos" className="text-sm underline underline-offset-4">
        Todos los partidos
      </Link>
      <p className="text-tinta-suave mt-3 mb-4">
        Mueve un partido como si llegaran datos del proveedor. Ábrelo en otra pestaña para ver el
        marcador cambiar en vivo.
      </p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <ul className="space-y-4">
        {partidos.map((p) => (
          <li key={p.id} className="border-perforado rounded-md border p-3">
            <p className="mb-2 font-semibold">
              {p.nombreLocal} {p.golesLocal ?? ''}
              {p.golesLocal !== null ? '–' : ' vs '}
              {p.golesVisitante ?? ''} {p.nombreVisitante}{' '}
              <span className="text-tinta-suave font-normal">
                · {NOMBRE_ESTADO_PARTIDO[p.estado]}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {eventosPara(p).map((e) => (
                <button
                  key={e.nombre}
                  type="button"
                  disabled={ocupado}
                  onClick={() => void simular(p, e)}
                  className="border-tinta hover:bg-franja rounded-md border-2 px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  {e.nombre}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
