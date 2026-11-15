'use client';

import { useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi } from '@/lib/api-cliente';

interface Evento {
  id: string;
  actorId: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  ip: string | null;
  creadoEn: string;
}

const formatoFecha = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Guayaquil',
});

/** FR-033: consulta de la auditoría por usuario, acción y fechas (solo lectura). */
export default function PaginaAuditoria() {
  const [filtro, setFiltro] = useState('');
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api<{ items: Evento[] }>(`/admin/auditoria${filtro}`)
      .then(({ items }) => {
        if (vigente) setEventos(items);
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(e instanceof ErrorApi ? e.message : 'No pudimos cargar la auditoría.');
      });
    return () => {
      vigente = false;
    };
  }, [filtro]);

  return (
    <Tarjeta antetitulo="Administración" titulo="Auditoría" ancho="max-w-4xl">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          const datos = new FormData(evento.currentTarget);
          const parametros = new URLSearchParams();
          for (const campo of ['usuarioId', 'accion'] as const) {
            const valor = String(datos.get(campo) ?? '').trim();
            if (valor) parametros.set(campo, valor);
          }
          for (const campo of ['desde', 'hasta'] as const) {
            const valor = String(datos.get(campo) ?? '');
            if (valor) parametros.set(campo, new Date(valor).toISOString());
          }
          setError(null);
          setFiltro(parametros.size ? `?${parametros.toString()}` : '');
        }}
        className="mb-5 grid gap-x-4 sm:grid-cols-2"
      >
        <Campo etiqueta="Id del usuario" name="usuarioId" ayuda="Como actor o como afectado." />
        <Campo
          etiqueta="Acción"
          name="accion"
          placeholder="usuario."
          ayuda="Empieza por, p. ej. retiro."
        />
        <Campo etiqueta="Desde" name="desde" type="datetime-local" />
        <Campo etiqueta="Hasta" name="hasta" type="datetime-local" />
        <div className="sm:col-span-2">
          <Boton>Filtrar</Boton>
        </div>
      </form>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!eventos && !error && <Aviso tipo="info">Cargando eventos…</Aviso>}
      {eventos?.length === 0 && <Aviso tipo="info">No hay eventos con esos filtros.</Aviso>}

      {eventos && eventos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">
              Eventos de auditoría, del más reciente al más antiguo
            </caption>
            <thead>
              <tr className="border-perforado border-b">
                <th scope="col" className="py-2 pr-3">
                  Fecha
                </th>
                <th scope="col" className="py-2 pr-3">
                  Acción
                </th>
                <th scope="col" className="py-2 pr-3">
                  Entidad
                </th>
                <th scope="col" className="py-2 pr-3">
                  Actor
                </th>
                <th scope="col" className="py-2">
                  IP
                </th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id} className="border-perforado border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <time dateTime={evento.creadoEn}>
                      {formatoFecha.format(new Date(evento.creadoEn))}
                    </time>
                  </td>
                  <td className="py-2 pr-3 font-mono">{evento.accion}</td>
                  <td className="py-2 pr-3 break-all">
                    {evento.entidad} {evento.entidadId?.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {evento.actorId?.slice(0, 8) ?? 'sistema'}
                  </td>
                  <td className="py-2">{evento.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-sm">
        <Enlace href="/admin/usuarios">Volver a usuarios</Enlace>
      </p>
    </Tarjeta>
  );
}
