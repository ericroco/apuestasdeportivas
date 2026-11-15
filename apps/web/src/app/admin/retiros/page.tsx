'use client';

import { useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

interface Pendiente {
  id: string;
  monto: string;
  motivosRevision: string[];
  creadoEn: string;
  usuario: { id: string; email: string; nombreCompleto: string };
  metodo: string;
  titular: string | null;
}

const formatoFecha = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Guayaquil',
});

function TarjetaRetiro({ retiro, alResolver }: { retiro: Pendiente; alResolver: () => void }) {
  const formulario = useFormulario();
  const [accion, setAccion] = useState<'aprobacion' | 'rechazo'>('aprobacion');

  const alEnviar = formulario.enviar(async (datos) => {
    await api(`/admin/retiros/${retiro.id}/${accion}`, {
      metodo: 'POST',
      cuerpo: {
        codigo2fa: texto(datos, 'codigo2fa').replace(/\s/g, ''),
        ...(accion === 'rechazo' ? { motivo: texto(datos, 'motivo') } : {}),
      },
    });
    alResolver();
  });

  return (
    <li className="py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-2xl font-bold">${retiro.monto}</p>
        <time dateTime={retiro.creadoEn} className="text-tinta-suave text-sm">
          {formatoFecha.format(new Date(retiro.creadoEn))}
        </time>
      </div>
      <p className="text-sm break-all">
        <span className="font-semibold">{retiro.usuario.email}</span> ·{' '}
        {retiro.usuario.nombreCompleto}
      </p>
      <p className="text-tinta-suave mb-2 text-sm">
        Destino: {retiro.metodo}
        {retiro.titular ? ` · ${retiro.titular}` : ''}
      </p>
      <ul className="mb-3 flex flex-wrap gap-2 text-xs" aria-label="Motivos de revisión">
        {retiro.motivosRevision.map((motivo) => (
          <li key={motivo} className="border-falla text-falla rounded border px-2 py-0.5">
            {motivo}
          </li>
        ))}
      </ul>
      <form onSubmit={alEnviar}>
        {formulario.error && <Aviso tipo="error">{formulario.error}</Aviso>}
        <fieldset className="mb-3 flex gap-4 text-sm">
          <legend className="sr-only">Decisión</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`accion-${retiro.id}`}
              checked={accion === 'aprobacion'}
              onChange={() => setAccion('aprobacion')}
            />
            Aprobar y pagar
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`accion-${retiro.id}`}
              checked={accion === 'rechazo'}
              onChange={() => setAccion('rechazo')}
            />
            Rechazar
          </label>
        </fieldset>
        {accion === 'rechazo' && (
          <Campo etiqueta="Motivo del rechazo" name="motivo" required minLength={5} />
        )}
        <Campo
          etiqueta="Tu código del segundo factor"
          name="codigo2fa"
          autoComplete="one-time-code"
          required
        />
        <Boton
          variante={accion === 'rechazo' ? 'peligro' : 'primario'}
          cargando={formulario.enviando}
        >
          {accion === 'rechazo' ? 'Rechazar retiro' : 'Aprobar retiro'}
        </Boton>
      </form>
    </li>
  );
}

/** HU8: retiros pendientes de revisión (solo administrador; la API lo exige). */
export default function PaginaRetirosPendientes() {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    api<Pendiente[]>('/admin/retiros')
      .then((lista) => {
        if (vigente) setPendientes(lista);
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof ErrorApi ? e.message : 'No pudimos cargar los retiros.');
      });
    return () => {
      vigente = false;
    };
  }, [version]);

  return (
    <Tarjeta antetitulo="Administración" titulo="Retiros en revisión" ancho="max-w-2xl">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!pendientes && !error && <Aviso tipo="info">Cargando…</Aviso>}
      {pendientes?.length === 0 && <Aviso tipo="exito">No hay retiros pendientes.</Aviso>}
      {pendientes && pendientes.length > 0 && (
        <ul className="divide-perforado divide-y">
          {pendientes.map((retiro) => (
            <TarjetaRetiro
              key={retiro.id}
              retiro={retiro}
              alResolver={() => setVersion((v) => v + 1)}
            />
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm">
        <Enlace href="/cuenta">Volver a mi cuenta</Enlace>
      </p>
    </Tarjeta>
  );
}
