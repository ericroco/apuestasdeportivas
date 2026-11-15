'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

const ROLES = [
  { valor: 'APOSTADOR', nombre: 'Apostador' },
  { valor: 'OPERADOR', nombre: 'Operador' },
  { valor: 'ADMINISTRADOR', nombre: 'Administrador' },
] as const;

interface Detalle {
  id: string;
  email: string;
  nombreCompleto: string;
  roles: string[];
  estado: 'PENDIENTE_VERIFICACION' | 'ACTIVO' | 'SUSPENDIDO';
  verificado: boolean;
  tiene2fa: boolean;
  sesionesActivas: number;
  actividad: { id: string; accion: string; creadoEn: string; ip: string | null }[];
}

const formatoFecha = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Guayaquil',
});

/** HU9: detalle de un usuario, cambio de roles (con el 2FA del administrador) y suspensión. */
export default function PaginaDetalleUsuario() {
  const { id } = useParams<{ id: string }>();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const roles = useFormulario();
  const suspension = useFormulario();

  useEffect(() => {
    let vigente = true;
    api<Detalle>(`/admin/usuarios/${id}`)
      .then((datos) => {
        if (vigente) setDetalle(datos);
      })
      .catch((e: unknown) => {
        if (vigente)
          setErrorCarga(e instanceof ErrorApi ? e.message : 'No pudimos cargar el usuario.');
      });
    return () => {
      vigente = false;
    };
  }, [id, version]);

  const cambiarRoles = roles.enviar(async (datos) => {
    await api(`/admin/usuarios/${id}/roles`, {
      metodo: 'PUT',
      cuerpo: {
        roles: ROLES.filter((rol) => datos.get(rol.valor) === 'on').map((rol) => rol.valor),
        codigo2fa: texto(datos, 'codigo2fa').replace(/\s/g, ''),
      },
    });
    setVersion((v) => v + 1);
    return 'Roles actualizados. El usuario debe volver a cargar su sesión.';
  });

  const cambiarSuspension = suspension.enviar(async (datos) => {
    if (detalle?.estado === 'SUSPENDIDO') {
      await api(`/admin/usuarios/${id}/suspension`, { metodo: 'DELETE' });
    } else {
      await api(`/admin/usuarios/${id}/suspension`, {
        metodo: 'POST',
        cuerpo: { motivo: texto(datos, 'motivo') },
      });
    }
    setVersion((v) => v + 1);
    return detalle?.estado === 'SUSPENDIDO'
      ? 'Cuenta reactivada.'
      : 'Cuenta suspendida y sesiones cerradas.';
  });

  return (
    <Tarjeta antetitulo="Administración" titulo="Usuario" ancho="max-w-2xl">
      {errorCarga && <Aviso tipo="error">{errorCarga}</Aviso>}
      {!detalle && !errorCarga && <Aviso tipo="info">Cargando…</Aviso>}

      {detalle && (
        <>
          <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-tinta-suave">Correo</dt>
            <dd className="font-semibold break-all">{detalle.email}</dd>
            <dt className="text-tinta-suave">Nombre</dt>
            <dd className="font-semibold">{detalle.nombreCompleto}</dd>
            <dt className="text-tinta-suave">Estado</dt>
            <dd className="font-semibold">
              {detalle.estado === 'SUSPENDIDO'
                ? 'Suspendido'
                : detalle.verificado
                  ? 'Activo'
                  : 'Sin confirmar'}
            </dd>
            <dt className="text-tinta-suave">Segundo factor</dt>
            <dd className="font-semibold">{detalle.tiene2fa ? 'Activo' : 'No activado'}</dd>
            <dt className="text-tinta-suave">Sesiones abiertas</dt>
            <dd className="font-semibold">{detalle.sesionesActivas}</dd>
          </dl>

          <section aria-labelledby="titulo-roles" className="corte-boleto mb-6 pt-5">
            <h2 id="titulo-roles" className="font-display mb-3 text-2xl font-bold">
              Roles
            </h2>
            <form onSubmit={cambiarRoles}>
              {roles.error && <Aviso tipo="error">{roles.error}</Aviso>}
              {roles.exito && <Aviso tipo="exito">{roles.exito}</Aviso>}
              <fieldset className="mb-4 flex flex-wrap gap-4">
                <legend className="sr-only">Roles del usuario</legend>
                {ROLES.map((rol) => (
                  <label key={rol.valor} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={rol.valor}
                      defaultChecked={detalle.roles.includes(rol.valor)}
                      className="size-4"
                    />
                    {rol.nombre}
                  </label>
                ))}
              </fieldset>
              <Campo
                etiqueta="Tu código del segundo factor"
                name="codigo2fa"
                autoComplete="one-time-code"
                required
                ayuda="Cambiar roles exige confirmar con tu propio código."
              />
              <Boton cargando={roles.enviando}>Guardar roles</Boton>
            </form>
          </section>

          <section aria-labelledby="titulo-suspension" className="corte-boleto mb-6 pt-5">
            <h2 id="titulo-suspension" className="font-display mb-3 text-2xl font-bold">
              {detalle.estado === 'SUSPENDIDO' ? 'Reactivar cuenta' : 'Suspender cuenta'}
            </h2>
            <form onSubmit={cambiarSuspension}>
              {suspension.error && <Aviso tipo="error">{suspension.error}</Aviso>}
              {suspension.exito && <Aviso tipo="exito">{suspension.exito}</Aviso>}
              {detalle.estado !== 'SUSPENDIDO' && (
                <Campo etiqueta="Motivo" name="motivo" required minLength={5} maxLength={500} />
              )}
              <Boton
                variante={detalle.estado === 'SUSPENDIDO' ? 'primario' : 'peligro'}
                cargando={suspension.enviando}
              >
                {detalle.estado === 'SUSPENDIDO' ? 'Reactivar cuenta' : 'Suspender cuenta'}
              </Boton>
            </form>
          </section>

          <section aria-labelledby="titulo-actividad" className="corte-boleto pt-5">
            <h2 id="titulo-actividad" className="font-display mb-3 text-2xl font-bold">
              Actividad reciente
            </h2>
            <ul className="text-sm">
              {detalle.actividad.map((evento) => (
                <li key={evento.id} className="flex flex-wrap justify-between gap-2 py-1">
                  <span className="font-mono">{evento.accion}</span>
                  <time dateTime={evento.creadoEn} className="text-tinta-suave">
                    {formatoFecha.format(new Date(evento.creadoEn))}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="mt-6 text-sm">
        <Enlace href="/admin/usuarios">Volver a usuarios</Enlace>
      </p>
    </Tarjeta>
  );
}
