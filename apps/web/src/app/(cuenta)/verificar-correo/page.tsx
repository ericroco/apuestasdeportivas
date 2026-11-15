'use client';

import { useEffect, useState } from 'react';
import { Aviso, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi } from '@/lib/api-cliente';

/** HU1: el enlace del correo trae `?token=`; la verificación la decide la API. */
export default function PaginaVerificarCorreo() {
  const [estado, setEstado] = useState<'verificando' | 'listo' | 'error'>('verificando');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    api('/identidad/correo/verificar', { metodo: 'POST', cuerpo: { token } })
      .then(() => setEstado('listo'))
      .catch((e: unknown) => {
        setMensaje(e instanceof ErrorApi ? e.message : 'No pudimos confirmar tu correo.');
        setEstado('error');
      });
  }, []);

  return (
    <Tarjeta titulo="Confirmar correo">
      {estado === 'verificando' && <Aviso tipo="info">Confirmando tu correo…</Aviso>}
      {estado === 'listo' && (
        <>
          <Aviso tipo="exito">Listo, tu correo quedó confirmado.</Aviso>
          <Enlace href="/iniciar-sesion">Iniciar sesión</Enlace>
        </>
      )}
      {estado === 'error' && (
        <>
          <Aviso tipo="error">{mensaje}</Aviso>
          <Enlace href="/iniciar-sesion">Ir a iniciar sesión</Enlace>
        </>
      )}
    </Tarjeta>
  );
}
