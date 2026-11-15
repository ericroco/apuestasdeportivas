'use client';

import { useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

interface Metodo {
  id: string;
  descripcion: string;
}

interface Retiro {
  id: string;
  monto: string;
  estado: 'PENDIENTE_REVISION' | 'PAGADO' | 'RECHAZADO';
  referenciaPago: string | null;
  comentario: string | null;
  creadoEn: string;
}

const ESTADO: Record<Retiro['estado'], string> = {
  PENDIENTE_REVISION: 'En revisión',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
};

/** HU7: retiro con 2FA solo a un método con el que el usuario depositó. La API valida todo. */
export default function PaginaRetirar() {
  const formulario = useFormulario();
  const [metodos, setMetodos] = useState<Metodo[] | null>(null);
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Una clave por retiro: dos clics, o reintentar tras un error de red, crean un solo retiro. Se genera al enviar
  // (no durante el prerender) y se renueva solo cuando el retiro se registró.
  const [claveSolicitud, setClaveSolicitud] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([api<Metodo[]>('/retiros/metodos'), api<Retiro[]>('/retiros')])
      .then(([listaMetodos, listaRetiros]) => {
        if (!vigente) return;
        setMetodos(listaMetodos);
        setRetiros(listaRetiros);
      })
      .catch((e: unknown) => {
        if (vigente)
          setErrorCarga(e instanceof ErrorApi ? e.message : 'No pudimos cargar tus datos.');
      });
    return () => {
      vigente = false;
    };
  }, [version]);

  const alEnviar = formulario.enviar(async (datos) => {
    const clave = claveSolicitud ?? crypto.randomUUID();
    setClaveSolicitud(clave);
    const retiro = await api<Retiro>('/retiros', {
      metodo: 'POST',
      cuerpo: {
        monto: texto(datos, 'monto').replace(',', '.').trim(),
        metodoPagoId: texto(datos, 'metodoPagoId'),
        codigo2fa: texto(datos, 'codigo2fa').replace(/\s/g, ''),
        claveSolicitud: clave,
      },
    });
    setClaveSolicitud(null);
    setVersion((v) => v + 1);
    return retiro.estado === 'PAGADO'
      ? `Retiro pagado. Referencia: ${retiro.referenciaPago}.`
      : 'Tu retiro quedó en revisión. Te avisaremos cuando el equipo lo resuelva.';
  });

  return (
    <Tarjeta antetitulo="Billetera" titulo="Retirar" ancho="max-w-xl">
      {errorCarga && <Aviso tipo="error">{errorCarga}</Aviso>}
      {formulario.error && <Aviso tipo="error">{formulario.error}</Aviso>}
      {formulario.exito && <Aviso tipo="exito">{formulario.exito}</Aviso>}

      {metodos?.length === 0 && (
        <Aviso tipo="info">
          Para retirar primero debes hacer un depósito: el dinero vuelve al mismo método.
        </Aviso>
      )}

      {metodos && metodos.length > 0 && (
        <form onSubmit={alEnviar} className="mb-6">
          <Campo
            etiqueta="Monto en dólares"
            name="monto"
            inputMode="decimal"
            required
            pattern="^\d{1,7}([.,]\d{1,2})?$"
            ayuda="Solo tu saldo real. Los retiros de más de 100.00 USD los revisa el equipo."
          />
          <div className="mb-4">
            <label htmlFor="metodo" className="mb-1 block font-semibold">
              Destino
            </label>
            <select
              id="metodo"
              name="metodoPagoId"
              required
              className="border-tinta-suave w-full rounded-md border bg-white px-3 py-2 text-base"
            >
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.descripcion}
                </option>
              ))}
            </select>
          </div>
          <Campo
            etiqueta="Código del segundo factor"
            name="codigo2fa"
            autoComplete="one-time-code"
            required
            ayuda="Es obligatorio para retirar. Si no lo tienes, actívalo en Seguridad."
          />
          <Boton cargando={formulario.enviando}>Solicitar retiro</Boton>
        </form>
      )}

      {retiros.length > 0 && (
        <section aria-labelledby="titulo-retiros" className="corte-boleto pt-5">
          <h2 id="titulo-retiros" className="font-display mb-3 text-2xl font-bold">
            Tus retiros
          </h2>
          <ul className="divide-perforado divide-y text-sm">
            {retiros.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-semibold">${r.monto}</span>
                <span
                  className={
                    r.estado === 'RECHAZADO' ? 'text-falla' : r.estado === 'PAGADO' ? 'text-ok' : ''
                  }
                >
                  {ESTADO[r.estado]}
                  {r.comentario ? ` · ${r.comentario}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 flex flex-wrap gap-4 text-sm">
        <Enlace href="/seguridad">Seguridad</Enlace>
        <Enlace href="/billetera">Volver a la billetera</Enlace>
      </p>
    </Tarjeta>
  );
}
