'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Aviso, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi, SesionVencida } from '@/lib/api-cliente';

interface Saldos {
  real: string;
  bono: string;
  retirable: string;
}

interface Movimiento {
  id: string;
  fecha: string;
  tipo: string;
  tipoSaldo: 'REAL' | 'BONO';
  monto: string;
  saldoResultante: string;
}

const NOMBRE_TIPO: Record<string, string> = {
  DEPOSITO: 'Depósito',
  APUESTA: 'Apuesta',
  PREMIO: 'Premio',
  REEMBOLSO: 'Reembolso',
  BONO: 'Bono',
  CONVERSION_BONO: 'Bono convertido',
  REVERSION_PREMIO: 'Corrección de premio',
  RETIRO_RESERVA: 'Retiro solicitado',
  RETIRO_PAGO: 'Retiro pagado',
  RETIRO_DEVOLUCION: 'Retiro rechazado',
};

const formatoFecha = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guayaquil',
});

/** HU4: saldos real y de bono y movimientos. Los montos vienen calculados por la API (principio III). */
export default function PaginaBilletera() {
  const router = useRouter();
  const [saldos, setSaldos] = useState<Saldos | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([
      api<Saldos>('/billetera'),
      api<{ items: Movimiento[]; siguiente: number | null }>(
        `/billetera/movimientos?pagina=${pagina}`,
      ),
    ])
      .then(([datos, lista]) => {
        if (!vigente) return;
        setSaldos(datos);
        setMovimientos((previos) => (pagina === 1 ? lista.items : [...previos, ...lista.items]));
        setHayMas(lista.siguiente !== null);
      })
      .catch((e: unknown) => {
        if (e instanceof SesionVencida) router.replace('/iniciar-sesion');
        else if (vigente)
          setError(e instanceof ErrorApi ? e.message : 'No pudimos cargar tu billetera.');
      });
    return () => {
      vigente = false;
    };
  }, [pagina, router]);

  return (
    <Tarjeta antetitulo="Mi cuenta" titulo="Billetera" ancho="max-w-xl">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!saldos && !error && <Aviso tipo="info">Cargando tu billetera…</Aviso>}

      {saldos && (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-md bg-white p-3">
              <dt className="text-tinta-suave text-sm">Saldo real</dt>
              <dd
                className={`font-display text-3xl font-bold ${saldos.real.startsWith('-') ? 'text-falla' : ''}`}
              >
                ${saldos.real}
              </dd>
            </div>
            <div className="rounded-md bg-white p-3">
              <dt className="text-tinta-suave text-sm">Saldo de bono</dt>
              <dd className="font-display text-3xl font-bold">${saldos.bono}</dd>
            </div>
          </dl>
          <p className="text-tinta-suave mb-4 text-sm">
            Puedes retirar ${saldos.retirable}. El saldo de bono no se retira hasta cumplir sus
            condiciones.
          </p>
          <div className="mb-6 flex flex-wrap gap-4">
            <Enlace href="/billetera/depositar">Depositar</Enlace>
            <Enlace href="/billetera/retirar">Retirar</Enlace>
            <Enlace href="/cuenta">Volver a mi cuenta</Enlace>
          </div>

          <section aria-labelledby="titulo-movimientos" className="corte-boleto pt-5">
            <h2 id="titulo-movimientos" className="font-display mb-3 text-2xl font-bold">
              Movimientos
            </h2>
            {movimientos.length === 0 ? (
              <p className="text-tinta-suave text-sm">Todavía no tienes movimientos.</p>
            ) : (
              <ul className="divide-perforado divide-y text-sm">
                {movimientos.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                  >
                    <div>
                      <p className="font-semibold">
                        {NOMBRE_TIPO[m.tipo] ?? m.tipo}
                        {m.tipoSaldo === 'BONO' && (
                          <span className="text-tinta-suave font-normal"> · bono</span>
                        )}
                      </p>
                      <time dateTime={m.fecha} className="text-tinta-suave">
                        {formatoFecha.format(new Date(m.fecha))}
                      </time>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${m.monto.startsWith('-') ? 'text-falla' : 'text-ok'}`}
                      >
                        {m.monto.startsWith('-') ? `−$${m.monto.slice(1)}` : `+$${m.monto}`}
                      </p>
                      <p className="text-tinta-suave">Saldo ${m.saldoResultante}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {hayMas && (
              <button
                type="button"
                onClick={() => setPagina((p) => p + 1)}
                className="text-tinta mt-3 font-semibold underline underline-offset-4"
              >
                Ver movimientos anteriores
              </button>
            )}
          </section>
        </>
      )}
    </Tarjeta>
  );
}
