'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi } from '@/lib/api-cliente';

interface UsuarioResumen {
  id: string;
  email: string;
  nombreCompleto: string;
  roles: string[];
  estado: 'PENDIENTE_VERIFICACION' | 'ACTIVO' | 'SUSPENDIDO';
  verificado: boolean;
}

const ESTADOS: Record<UsuarioResumen['estado'], string> = {
  PENDIENTE_VERIFICACION: 'Sin confirmar',
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
};

/** HU9: búsqueda de usuarios (solo administrador; la API lo exige en cada ruta). */
export default function PaginaUsuarios() {
  const [consulta, setConsulta] = useState('');
  const [usuarios, setUsuarios] = useState<UsuarioResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const parametros = consulta ? `?q=${encodeURIComponent(consulta)}` : '';
    api<{ items: UsuarioResumen[] }>(`/admin/usuarios${parametros}`)
      .then(({ items }) => {
        if (vigente) setUsuarios(items);
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(e instanceof ErrorApi ? e.message : 'No pudimos cargar los usuarios.');
      });
    return () => {
      vigente = false;
    };
  }, [consulta]);

  return (
    <Tarjeta antetitulo="Administración" titulo="Usuarios" ancho="max-w-3xl">
      <form
        role="search"
        onSubmit={(evento) => {
          evento.preventDefault();
          setConsulta(String(new FormData(evento.currentTarget).get('q') ?? '').trim());
        }}
        className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="grow">
          <Campo etiqueta="Buscar por correo o nombre" name="q" type="search" />
        </div>
        <div className="mb-4">
          <Boton>Buscar</Boton>
        </div>
      </form>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!usuarios && !error && <Aviso tipo="info">Cargando usuarios…</Aviso>}
      {usuarios?.length === 0 && <Aviso tipo="info">No hay usuarios que coincidan.</Aviso>}

      {usuarios && usuarios.length > 0 && (
        <ul className="divide-perforado divide-y">
          {usuarios.map((usuario) => (
            <li key={usuario.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/usuarios/${usuario.id}`}
                  className="font-semibold break-all underline underline-offset-4 hover:no-underline"
                >
                  {usuario.email}
                </Link>
                <p className="text-tinta-suave text-sm">
                  {usuario.nombreCompleto} · {usuario.roles.join(', ')}
                </p>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-sm font-semibold ${
                  usuario.estado === 'SUSPENDIDO' ? 'text-falla' : 'text-ok'
                }`}
              >
                {ESTADOS[usuario.estado]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 flex flex-wrap gap-4 text-sm">
        <Enlace href="/admin/usuarios/auditoria">Ver auditoría</Enlace>
        <Enlace href="/cuenta">Volver a mi cuenta</Enlace>
      </p>
    </Tarjeta>
  );
}
