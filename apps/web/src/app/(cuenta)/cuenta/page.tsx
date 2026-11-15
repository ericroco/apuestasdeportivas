'use client';

import { useRouter } from 'next/navigation';
import { Aviso, Boton, Enlace, Tarjeta } from '@/components/ui';
import { api } from '@/lib/api-cliente';
import { useFormulario } from '@/lib/use-formulario';
import { usePerfil } from '@/lib/use-perfil';

const NOMBRE_ROL = { APOSTADOR: 'Apostador', OPERADOR: 'Operador', ADMINISTRADOR: 'Administrador' };

/** Inicio de la cuenta: datos, estado del correo y del 2FA, accesos y cierre de sesión. */
export default function PaginaCuenta() {
  const router = useRouter();
  const { perfil } = usePerfil();
  const reenvio = useFormulario();
  const cierre = useFormulario();

  const reenviar = reenvio.enviar(async () => {
    const { mensaje } = await api<{ mensaje: string }>('/identidad/correo/reenviar', {
      metodo: 'POST',
    });
    return mensaje;
  });

  const cerrar = cierre.enviar(async () => {
    await api('/identidad/sesion/cerrar', { metodo: 'POST' });
    router.replace('/iniciar-sesion');
  });

  if (!perfil) {
    return (
      <Tarjeta titulo="Mi cuenta">
        <Aviso tipo="info">Cargando tu cuenta…</Aviso>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Mi cuenta">
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-tinta-suave">Nombre</dt>
        <dd className="font-semibold break-words">{perfil.nombreCompleto}</dd>
        <dt className="text-tinta-suave">Correo</dt>
        <dd className="font-semibold break-all">{perfil.email}</dd>
        <dt className="text-tinta-suave">Rol</dt>
        <dd className="font-semibold">{perfil.roles.map((rol) => NOMBRE_ROL[rol]).join(', ')}</dd>
        <dt className="text-tinta-suave">Segundo factor</dt>
        <dd className="font-semibold">{perfil.tiene2fa ? 'Activo' : 'No activado'}</dd>
      </dl>

      {!perfil.verificado && (
        <form onSubmit={reenviar} className="mb-5">
          <Aviso tipo="info">
            Confirma tu correo para poder depositar, apostar y retirar. Revisa tu bandeja de
            entrada.
          </Aviso>
          {reenvio.exito && <Aviso tipo="exito">{reenvio.exito}</Aviso>}
          {reenvio.error && <Aviso tipo="error">{reenvio.error}</Aviso>}
          <Boton variante="secundario" cargando={reenvio.enviando}>
            Reenviar correo de confirmación
          </Boton>
        </form>
      )}

      <nav aria-label="Secciones de la cuenta" className="mb-6 flex flex-col gap-2">
        {perfil.roles.every((rol) => rol === 'APOSTADOR') && (
          <Enlace href="/billetera">Billetera</Enlace>
        )}
        <Enlace href="/seguridad">Seguridad y segundo factor</Enlace>
        {perfil.roles.includes('ADMINISTRADOR') && (
          <>
            <Enlace href="/admin/usuarios">Administrar usuarios</Enlace>
            <Enlace href="/admin/usuarios/auditoria">Registro de auditoría</Enlace>
          </>
        )}
      </nav>

      <form onSubmit={cerrar} className="corte-boleto pt-5">
        {cierre.error && <Aviso tipo="error">{cierre.error}</Aviso>}
        <Boton variante="secundario" cargando={cierre.enviando}>
          Cerrar sesión
        </Boton>
      </form>
    </Tarjeta>
  );
}
