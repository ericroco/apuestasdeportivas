'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ErrorApi, SesionVencida } from '@/lib/api-cliente';
import { formatearMonto } from '@/lib/formato';
import { apostar, cuotasVigentesDe, solicitudVivo } from '@/lib/partidos/api';
import { estimar, montoValido } from '@/lib/partidos/boleto';
import { motivoRechazoVivo } from '@/lib/partidos/textos';
import { useBoleto } from './contexto-boleto';

type Estado =
  | { tipo: 'editando' }
  | { tipo: 'enviando' }
  | { tipo: 'aceptada'; monto: string; ganancia: string }
  | { tipo: 'en-espera'; solicitudId: string }
  | { tipo: 'error'; mensaje: string; sesionVencida?: boolean }
  | { tipo: 'reconfirmar' };

const ESPERA_ENTRE_CONSULTAS_MS = 1_000;

/**
 * Boleto de apuesta (HU2, HU4, HU7). Muestra una estimación informativa; la cuota y la ganancia que cuentan las
 * congela la API al aceptar (FR-016, FR-041). La clave de la solicitud se conserva entre reintentos: un doble
 * clic o un reintento de red producen una sola apuesta (FR-020).
 */
export function Boleto() {
  const { selecciones, despachar } = useBoleto();
  const [monto, setMonto] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'editando' });
  const clave = useRef<string | null>(null);
  const estimacion = estimar(selecciones, monto);
  const esCombinada = selecciones.length > 1;

  useEsperaEnVivo(estado, setEstado);

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (!montoValido(monto) || selecciones.length === 0) return;
    clave.current ??= crypto.randomUUID();
    setEstado({ tipo: 'enviando' });
    try {
      const resultado = await apostar({
        claveSolicitud: clave.current,
        monto,
        selecciones: selecciones.map((s) => ({ seleccionId: s.seleccionId, cuotaVista: s.cuota })),
      });
      clave.current = null;
      if (resultado.tipo === 'en-espera') {
        setEstado({ tipo: 'en-espera', solicitudId: resultado.solicitud.solicitudId });
        return;
      }
      despachar({ tipo: 'vaciar' });
      setEstado({
        tipo: 'aceptada',
        monto: resultado.apuesta.monto,
        ganancia: resultado.apuesta.gananciaPotencial,
      });
    } catch (error) {
      const cuotas = cuotasVigentesDe(error);
      if (cuotas) {
        // Cuota nueva = apuesta nueva: la siguiente confirmación usa otra clave.
        clave.current = null;
        despachar({ tipo: 'actualizar-cuotas', cuotas });
        setEstado({ tipo: 'reconfirmar' });
        return;
      }
      if (error instanceof ErrorApi && error.estado !== 503) clave.current = null;
      setEstado({
        tipo: 'error',
        mensaje: error instanceof Error ? error.message : 'No se pudo enviar la apuesta.',
        sesionVencida: error instanceof SesionVencida,
      });
    }
  }

  return (
    <aside
      aria-labelledby="titulo-boleto"
      className="bg-papel text-tinta overflow-hidden rounded-lg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]"
    >
      <header className="bg-franja px-5 pt-4 pb-3">
        <h2 id="titulo-boleto" className="font-display text-3xl leading-none font-bold">
          {esCombinada ? `Combinada de ${selecciones.length}` : 'Tu boleto'}
        </h2>
      </header>

      {selecciones.length === 0 ? (
        <p className="text-tinta-suave px-5 py-6">
          Elige una cuota en la cartelera para empezar tu apuesta. Con selecciones de partidos
          distintos armas una combinada.
        </p>
      ) : (
        <ul className="divide-perforado divide-y px-5">
          {selecciones.map((s) => (
            <li key={s.seleccionId} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{s.nombre}</p>
                <p className="text-tinta-suave text-sm">
                  {s.mercado} · {s.partido}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-bold tabular-nums">{s.cuota}</span>
                <button
                  type="button"
                  onClick={() => despachar({ tipo: 'quitar', seleccionId: s.seleccionId })}
                  aria-label={`Quitar ${s.nombre} del boleto`}
                  className="text-tinta-suave hover:text-falla rounded px-1 text-xl leading-none"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={confirmar} className="corte-boleto px-5 pt-5 pb-6">
        <label htmlFor="monto-boleto" className="mb-1 block font-semibold">
          Monto en dólares
        </label>
        <input
          id="monto-boleto"
          inputMode="decimal"
          autoComplete="off"
          value={monto}
          onChange={(e) => setMonto(e.target.value.replace(',', '.'))}
          aria-describedby="estimacion-boleto"
          className="border-tinta-suave w-full rounded-md border bg-white px-3 py-2 text-lg tabular-nums"
          placeholder="10.00"
        />
        <dl id="estimacion-boleto" className="my-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-tinta-suave">Cuota{esCombinada ? ' total' : ''}</dt>
          <dd className="text-right font-semibold tabular-nums">{estimacion?.cuotaTotal ?? '—'}</dd>
          <dt className="text-tinta-suave">Ganarías (estimado)</dt>
          <dd className="text-right font-semibold tabular-nums">
            {estimacion?.ganancia ? formatearMonto(estimacion.ganancia) : '—'}
          </dd>
        </dl>
        <MensajeEstado estado={estado} />
        <button
          type="submit"
          disabled={selecciones.length === 0 || !montoValido(monto) || estado.tipo === 'enviando'}
          aria-busy={estado.tipo === 'enviando'}
          className="bg-tinta text-papel hover:bg-franja hover:text-tinta w-full rounded-md px-4 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {estado.tipo === 'enviando'
            ? 'Confirmando…'
            : estado.tipo === 'reconfirmar'
              ? 'Confirmar con las cuotas nuevas'
              : 'Confirmar apuesta'}
        </button>
      </form>
    </aside>
  );
}

function MensajeEstado({ estado }: { estado: Estado }) {
  switch (estado.tipo) {
    case 'aceptada':
      return (
        <p
          role="status"
          className="border-ok text-ok mb-4 rounded-md border-l-4 bg-white px-3 py-2 text-sm"
        >
          {estado.monto
            ? `Apuesta aceptada: ${formatearMonto(estado.monto)} para ganar ${formatearMonto(estado.ganancia)}.`
            : 'Apuesta en vivo aceptada.'}{' '}
          <Link href="/mis-apuestas" className="underline underline-offset-4">
            Ver mis apuestas
          </Link>
        </p>
      );
    case 'en-espera':
      return (
        <p
          role="status"
          className="border-aviso text-aviso mb-4 rounded-md border-l-4 bg-white px-3 py-2 text-sm"
        >
          Apuesta en vivo en espera: la confirmamos en unos segundos si el partido no cambia.
          Todavía no se descontó nada.
        </p>
      );
    case 'reconfirmar':
      return (
        <p
          role="alert"
          className="border-aviso text-aviso mb-4 rounded-md border-l-4 bg-white px-3 py-2 text-sm"
        >
          Las cuotas cambiaron mientras decidías. Revisa las nuevas y confirma otra vez.
        </p>
      );
    case 'error':
      return (
        <p
          role="alert"
          className="border-falla text-falla mb-4 rounded-md border-l-4 bg-white px-3 py-2 text-sm"
        >
          {estado.mensaje}{' '}
          {estado.sesionVencida && (
            <Link href="/iniciar-sesion" className="underline underline-offset-4">
              Iniciar sesión
            </Link>
          )}
        </p>
      );
    default:
      return null;
  }
}

/** Mientras una apuesta en vivo espera su retardo, consulta su estado hasta que se resuelve (FR-018). */
function useEsperaEnVivo(estado: Estado, setEstado: (estado: Estado) => void): void {
  const { despachar } = useBoleto();
  const solicitudId = estado.tipo === 'en-espera' ? estado.solicitudId : null;

  useEffect(() => {
    if (!solicitudId) return;
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout>;
    const consultar = async () => {
      try {
        const solicitud = await solicitudVivo(solicitudId);
        if (!vigente) return;
        if (solicitud.estado === 'ACEPTADA') {
          despachar({ tipo: 'vaciar' });
          setEstado({ tipo: 'aceptada', monto: '', ganancia: '' });
          return;
        }
        if (solicitud.estado === 'RECHAZADA') {
          setEstado({ tipo: 'error', mensaje: motivoRechazoVivo(solicitud.motivoRechazo) });
          return;
        }
      } catch {
        // Un fallo de red no resuelve la apuesta: se vuelve a consultar.
      }
      temporizador = setTimeout(consultar, ESPERA_ENTRE_CONSULTAS_MS);
    };
    temporizador = setTimeout(consultar, ESPERA_ENTRE_CONSULTAS_MS);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [solicitudId, despachar, setEstado]);
}
