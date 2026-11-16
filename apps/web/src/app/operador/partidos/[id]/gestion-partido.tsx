'use client';

import type { EstadoPartido, PartidoDetalleDto, TipoMercado } from '@apuestas/shared';
import { TIPOS_MERCADO } from '@apuestas/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Tarjeta } from '@/components/ui';
import { aIsoDesdeLocal, formatearFechaHora } from '@/lib/formato';
import { obtenerPartido, operador } from '@/lib/partidos/api';
import { NOMBRE_ESTADO_PARTIDO, nombreMercado, nombreSeleccion } from '@/lib/partidos/textos';

/** Acciones de estado que ofrece el panel según el estado actual (máquina de estados de data-model.md). */
const ACCIONES: Readonly<
  Record<EstadoPartido, ReadonlyArray<{ estado: EstadoPartido; nombre: string }>>
> = {
  PROGRAMADO: [
    { estado: 'EN_VIVO', nombre: 'Iniciar partido' },
    { estado: 'APLAZADO', nombre: 'Aplazar' },
    { estado: 'CANCELADO', nombre: 'Cancelar partido' },
  ],
  EN_VIVO: [
    { estado: 'SUSPENDIDO', nombre: 'Suspender' },
    { estado: 'CANCELADO', nombre: 'Cancelar partido' },
  ],
  SUSPENDIDO: [
    { estado: 'EN_VIVO', nombre: 'Reanudar' },
    { estado: 'CANCELADO', nombre: 'Cancelar partido' },
  ],
  APLAZADO: [
    { estado: 'PROGRAMADO', nombre: 'Reprogramar' },
    { estado: 'CANCELADO', nombre: 'Cancelar partido' },
  ],
  FINALIZADO: [],
  CANCELADO: [],
};

const SELECCIONES: Readonly<Record<TipoMercado, readonly string[]>> = {
  RESULTADO_FINAL: ['LOCAL', 'EMPATE', 'VISITANTE'],
  DOBLE_OPORTUNIDAD: ['LOCAL_EMPATE', 'EMPATE_VISITANTE', 'LOCAL_VISITANTE'],
  MAS_MENOS_GOLES: ['MAS', 'MENOS'],
  AMBOS_MARCAN: ['SI', 'NO'],
};

/**
 * HU1, HU6 y HU8 para el operador: estados con motivo (suspender, aplazar, reprogramar, cancelar), marcador,
 * resultado final o su corrección (con motivo obligatorio y confirmación), mercados y cuotas. Toda acción queda
 * auditada en la API; aquí solo se envía y se muestra lo que la API devuelve.
 */
export function GestionPartido() {
  const { id } = useParams<{ id: string }>();
  const [partido, setPartido] = useState<PartidoDetalleDto | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tipoMercado, setTipoMercado] = useState<TipoMercado>('RESULTADO_FINAL');

  const cargar = useCallback(() => {
    obtenerPartido(id)
      .then(setPartido)
      .catch((e: unknown) => setAviso({ tipo: 'error', texto: mensaje(e) }));
  }, [id]);
  useEffect(cargar, [cargar]);

  async function ejecutar(accion: () => Promise<PartidoDetalleDto>, exito: string) {
    setOcupado(true);
    try {
      setPartido(await accion());
      setAviso({ tipo: 'exito', texto: exito });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensaje(e) });
    } finally {
      setOcupado(false);
    }
  }

  if (!partido) {
    return (
      <Tarjeta antetitulo="Operador" titulo="Partido">
        {aviso ? (
          <Aviso tipo="error">{aviso.texto}</Aviso>
        ) : (
          <p className="text-tinta-suave">Cargando…</p>
        )}
      </Tarjeta>
    );
  }

  const { estado } = partido;
  const titulo = `${partido.nombreLocal} vs ${partido.nombreVisitante}`;

  function cambiarEstado(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const destino = String(datos.get('estado')) as EstadoPartido;
    const motivo = String(datos.get('motivo')).trim();
    const inicio =
      destino === 'PROGRAMADO' ? aIsoDesdeLocal(String(datos.get('inicioEn'))) : undefined;
    if (destino === 'PROGRAMADO' && !inicio) {
      return setAviso({ tipo: 'error', texto: 'Indica la nueva fecha y hora para reprogramar.' });
    }
    if (
      destino === 'CANCELADO' &&
      !window.confirm('Cancelar anula y reembolsa todas las apuestas. ¿Continuar?')
    ) {
      return;
    }
    void ejecutar(
      () => operador.cambiarEstado(id, destino, motivo, inicio ?? undefined),
      `Partido: ${NOMBRE_ESTADO_PARTIDO[destino]}.`,
    );
  }

  function registrarResultado(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const local = Number(datos.get('golesLocal'));
    const visitante = Number(datos.get('golesVisitante'));
    const motivo = String(datos.get('motivo')).trim();
    const esCorreccion = estado === 'FINALIZADO';
    if (
      esCorreccion &&
      !window.confirm(
        `Corregir el resultado a ${local}–${visitante} re-liquida las apuestas. ¿Continuar?`,
      )
    ) {
      return;
    }
    void ejecutar(
      () => operador.registrarResultado(id, local, visitante, motivo),
      esCorreccion
        ? 'Resultado corregido: las apuestas se re-liquidan.'
        : 'Partido finalizado: las apuestas se liquidan.',
    );
  }

  function crearMercado(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const linea = String(datos.get('linea') ?? '').trim();
    void ejecutar(
      () =>
        operador.crearMercado(id, {
          tipo: tipoMercado,
          ...(tipoMercado === 'MAS_MENOS_GOLES' ? { linea } : {}),
          admiteVivo: datos.get('admiteVivo') === 'on',
          selecciones: SELECCIONES[tipoMercado].map((codigo) => ({
            codigo,
            cuota: String(datos.get(`cuota-${codigo}`)).replace(',', '.'),
          })),
        }),
      'Mercado creado.',
    );
  }

  return (
    <Tarjeta antetitulo={partido.competicion.nombre} titulo={titulo} ancho="max-w-3xl">
      <Link href="/operador/partidos" className="text-sm underline underline-offset-4">
        Todos los partidos
      </Link>
      <p className="mt-3 mb-4 text-lg">
        <strong>{NOMBRE_ESTADO_PARTIDO[estado]}</strong> · inicio{' '}
        {formatearFechaHora(partido.inicioEn)}
        {partido.golesLocal !== null && ` · ${partido.golesLocal}–${partido.golesVisitante}`}
      </p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {ACCIONES[estado].length > 0 && (
        <form onSubmit={cambiarEstado} className="mb-6">
          <h2 className="font-display mb-2 text-2xl font-bold">Estado</h2>
          <fieldset className="mb-3 flex flex-wrap gap-3">
            <legend className="sr-only">Nuevo estado</legend>
            {ACCIONES[estado].map((a, i) => (
              <label key={a.estado} className="flex items-center gap-2">
                <input type="radio" name="estado" value={a.estado} defaultChecked={i === 0} />
                {a.nombre}
              </label>
            ))}
          </fieldset>
          {estado === 'APLAZADO' && (
            <Campo etiqueta="Nueva fecha (al reprogramar)" name="inicioEn" type="datetime-local" />
          )}
          <Campo etiqueta="Motivo" name="motivo" required maxLength={500} />
          <Boton cargando={ocupado}>Aplicar cambio de estado</Boton>
        </form>
      )}

      {estado === 'EN_VIVO' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void ejecutar(
              () =>
                operador.actualizarMarcador(
                  id,
                  Number(d.get('golesLocal')),
                  Number(d.get('golesVisitante')),
                ),
              'Marcador actualizado.',
            );
          }}
          className="mb-6"
        >
          <h2 className="font-display mb-2 text-2xl font-bold">Marcador en vivo</h2>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta={partido.nombreLocal}
              name="golesLocal"
              type="number"
              min={0}
              defaultValue={partido.golesLocal ?? 0}
            />
            <Campo
              etiqueta={partido.nombreVisitante}
              name="golesVisitante"
              type="number"
              min={0}
              defaultValue={partido.golesVisitante ?? 0}
            />
          </div>
          <Boton variante="secundario" cargando={ocupado}>
            Guardar marcador
          </Boton>
        </form>
      )}

      {(estado === 'EN_VIVO' || estado === 'PROGRAMADO' || estado === 'FINALIZADO') && (
        <form onSubmit={registrarResultado} className="mb-6">
          <h2 className="font-display mb-2 text-2xl font-bold">
            {estado === 'FINALIZADO' ? 'Corregir resultado' : 'Resultado final'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta={partido.nombreLocal}
              name="golesLocal"
              type="number"
              min={0}
              required
              defaultValue={partido.golesLocal ?? 0}
            />
            <Campo
              etiqueta={partido.nombreVisitante}
              name="golesVisitante"
              type="number"
              min={0}
              required
              defaultValue={partido.golesVisitante ?? 0}
            />
          </div>
          <Campo
            etiqueta="Motivo"
            name="motivo"
            required
            maxLength={500}
            ayuda="Queda en la auditoría junto al resultado anterior y el nuevo."
          />
          <Boton variante={estado === 'FINALIZADO' ? 'peligro' : 'primario'} cargando={ocupado}>
            {estado === 'FINALIZADO' ? 'Corregir y re-liquidar' : 'Finalizar y liquidar'}
          </Boton>
        </form>
      )}

      <h2 className="font-display mb-2 text-2xl font-bold">Mercados</h2>
      {partido.mercados.map((m) => (
        <section
          key={m.id}
          aria-label={nombreMercado(m.tipo, m.linea)}
          className="border-perforado mb-3 rounded-md border p-3"
        >
          <h3 className="mb-2 flex flex-wrap items-center justify-between gap-2 font-semibold">
            {nombreMercado(m.tipo, m.linea)} · {m.estado.toLowerCase()}
            {m.estado !== 'CERRADO' && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  const accion = m.estado === 'ABIERTO' ? 'suspender' : 'reabrir';
                  const motivo = window.prompt(`Motivo para ${accion} el mercado:`)?.trim();
                  if (motivo)
                    void ejecutar(
                      () => operador.cambiarEstadoMercado(m.id, accion, motivo),
                      'Mercado actualizado.',
                    );
                }}
                className="border-tinta rounded-md border-2 px-3 py-1 text-sm"
              >
                {m.estado === 'ABIERTO' ? 'Suspender mercado' : 'Reabrir mercado'}
              </button>
            )}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {m.selecciones.map((s) => (
              <li key={s.id}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cuota = String(new FormData(e.currentTarget).get('cuota')).replace(
                      ',',
                      '.',
                    );
                    void ejecutar(() => operador.cambiarCuota(s.id, cuota), 'Cuota actualizada.');
                  }}
                  className="flex items-end gap-2"
                >
                  <label className="flex-1 text-sm">
                    {nombreSeleccion(
                      s.codigo,
                      partido.nombreLocal,
                      partido.nombreVisitante,
                      m.linea,
                    )}
                    <input
                      name="cuota"
                      defaultValue={s.cuota}
                      inputMode="decimal"
                      className="border-tinta-suave mt-1 w-full rounded-md border bg-white px-2 py-1 tabular-nums"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={ocupado || m.estado === 'CERRADO'}
                    className="bg-tinta text-papel rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Cambiar cuota
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {estado !== 'FINALIZADO' && estado !== 'CANCELADO' && (
        <form onSubmit={crearMercado} className="corte-boleto mt-6 pt-6">
          <h3 className="font-display mb-3 text-xl font-bold">Agregar mercado</h3>
          <label htmlFor="tipo-mercado" className="mb-1 block font-semibold">
            Tipo
          </label>
          <select
            id="tipo-mercado"
            value={tipoMercado}
            onChange={(e) => setTipoMercado(e.target.value as TipoMercado)}
            className="border-tinta-suave mb-3 w-full rounded-md border bg-white px-3 py-2"
          >
            {TIPOS_MERCADO.map((t) => (
              <option key={t} value={t}>
                {nombreMercado(t, 'N')}
              </option>
            ))}
          </select>
          {tipoMercado === 'MAS_MENOS_GOLES' && (
            <Campo etiqueta="Línea de goles" name="linea" placeholder="2.5" required />
          )}
          {SELECCIONES[tipoMercado].map((codigo) => (
            <Campo
              key={`${tipoMercado}-${codigo}`}
              etiqueta={`Cuota: ${nombreSeleccion(codigo as never, partido.nombreLocal, partido.nombreVisitante, 'N')}`}
              name={`cuota-${codigo}`}
              inputMode="decimal"
              placeholder="2.10"
              required
            />
          ))}
          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" name="admiteVivo" /> Admite apuestas en vivo
          </label>
          <Boton cargando={ocupado}>Crear mercado</Boton>
        </form>
      )}
    </Tarjeta>
  );
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la acción.';
}
