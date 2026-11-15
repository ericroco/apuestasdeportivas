'use client';

import { useState } from 'react';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

/** FR-067: fija la contraseña nueva con el token del correo. Cierra todas las sesiones. */
export default function PaginaRestablecer() {
  const { enviando, error, exito, enviar, setError } = useFormulario();
  // El token viaja en la URL del correo; solo existe en el navegador.
  const [token] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('token') ?? ''),
  );

  const alEnviar = enviar(async (datos) => {
    if (texto(datos, 'contrasena') !== texto(datos, 'confirmacion')) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    await api('/identidad/contrasena/restablecer', {
      metodo: 'POST',
      cuerpo: { token, contrasena: texto(datos, 'contrasena') },
    });
    return 'Tu contraseña cambió y cerramos tus sesiones abiertas. Ya puedes iniciar sesión.';
  });

  return (
    <Tarjeta titulo="Nueva contraseña">
      {exito ? (
        <>
          <Aviso tipo="exito">{exito}</Aviso>
          <Enlace href="/iniciar-sesion">Iniciar sesión</Enlace>
        </>
      ) : (
        <form onSubmit={alEnviar}>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Campo
            etiqueta="Contraseña nueva"
            name="contrasena"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            ayuda="Al menos 12 caracteres. Evita contraseñas comunes."
          />
          <Campo
            etiqueta="Repite la contraseña"
            name="confirmacion"
            type="password"
            autoComplete="new-password"
            required
          />
          <Boton cargando={enviando}>Cambiar contraseña</Boton>
        </form>
      )}
    </Tarjeta>
  );
}
