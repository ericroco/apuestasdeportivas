'use client';

import type { CompeticionDto, PartidoResumenDto } from '@apuestas/shared';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Tarjeta } from '@/components/ui';
import { aIsoDesdeLocal, formatearFechaHora } from '@/lib/formato';
import { listarCompeticiones, listarPartidos, operador } from '@/lib/partidos/api';
import { NOMBRE_ESTADO_PARTIDO } from '@/lib/partidos/textos';

/** HU1: panel del operador. Lista los partidos por jugar y en juego, y da de alta partidos y competiciones. */
export default function PaginaOperadorPartidos() {
  const [partidos, setPartidos] = useState<PartidoResumenDto[]>([]);
  const [competiciones, setCompeticiones] = useState<CompeticionDto[]>([]);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    Promise.all([listarPartidos(), listarCompeticiones()])
      .then(([pagina, lista]) => {
        setPartidos(pagina.elementos);
        setCompeticiones(lista);
      })
      .catch((e: unknown) => setAviso({ tipo: 'error', texto: mensaje(e) }));
  }, []);

  useEffect(cargar, [cargar]);

  async function crearPartido(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const inicioEn = aIsoDesdeLocal(String(datos.get('inicioEn')));
    if (!inicioEn)
      return setAviso({ tipo: 'error', texto: 'Indica una fecha y hora de inicio válidas.' });
    setEnviando(true);
    try {
      let competicionId = String(datos.get('competicionId'));
      const nueva = String(datos.get('nuevaCompeticion') ?? '').trim();
      if (nueva) competicionId = (await operador.crearCompeticion(nueva)).id;
      const partido = await operador.crearPartido({
        competicionId,
        nombreLocal: String(datos.get('nombreLocal')),
        nombreVisitante: String(datos.get('nombreVisitante')),
        inicioEn,
      });
      setAviso({
        tipo: 'exito',
        texto: `Partido creado: ${partido.nombreLocal} vs ${partido.nombreVisitante}.`,
      });
      evento.currentTarget.reset();
      cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensaje(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tarjeta antetitulo="Operador" titulo="Partidos" ancho="max-w-3xl">
      <nav
        aria-label="Herramientas del operador"
        className="mb-5 flex flex-wrap gap-4 text-sm font-semibold"
      >
        <Link href="/operador/simulacion" className="underline underline-offset-4">
          Simular un partido
        </Link>
        <Link href="/operador/consumo" className="underline underline-offset-4">
          Consumo del proveedor
        </Link>
      </nav>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <ul className="divide-perforado mb-8 divide-y">
        {partidos.length === 0 && (
          <li className="text-tinta-suave py-3">No hay partidos por jugar.</li>
        )}
        {partidos.map((p) => (
          <li key={p.id}>
            <Link
              href={`/operador/partidos/${p.id}`}
              className="hover:bg-papel-hondo flex flex-wrap items-baseline justify-between gap-2 py-3"
            >
              <span className="font-semibold">
                {p.nombreLocal} vs {p.nombreVisitante}
              </span>
              <span className="text-tinta-suave text-sm">
                {NOMBRE_ESTADO_PARTIDO[p.estado]} · {formatearFechaHora(p.inicioEn)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <form onSubmit={crearPartido} className="corte-boleto pt-6">
        <h2 className="font-display mb-3 text-2xl font-bold">Nuevo partido</h2>
        <label htmlFor="competicion" className="mb-1 block font-semibold">
          Competición
        </label>
        <select
          id="competicion"
          name="competicionId"
          className="border-tinta-suave mb-2 w-full rounded-md border bg-white px-3 py-2"
        >
          {competiciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <Campo
          etiqueta="O crea una competición nueva"
          name="nuevaCompeticion"
          ayuda="Déjalo vacío para usar la elegida."
        />
        <Campo etiqueta="Equipo local" name="nombreLocal" required maxLength={80} />
        <Campo etiqueta="Equipo visitante" name="nombreVisitante" required maxLength={80} />
        <Campo etiqueta="Inicio" name="inicioEn" type="datetime-local" required />
        <Boton cargando={enviando}>Crear partido</Boton>
      </form>
    </Tarjeta>
  );
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la acción.';
}
