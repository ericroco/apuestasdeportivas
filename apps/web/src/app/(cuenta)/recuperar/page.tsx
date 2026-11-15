'use client';

import { useState } from 'react';
import { Turnstile } from '@/components/turnstile';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

/** FR-067: pide el enlace de recuperación. La respuesta es la misma exista o no el correo. */
export default function PaginaRecuperar() {
  const { enviando, error, exito, enviar } = useFormulario();
  const [captcha, setCaptcha] = useState('');
  const [reinicio, setReinicio] = useState(0);

  const alEnviar = enviar(async (datos) => {
    try {
      const { mensaje } = await api<{ mensaje: string }>('/identidad/contrasena/olvido', {
        metodo: 'POST',
        cuerpo: { email: texto(datos, 'email'), captcha },
      });
      return mensaje;
    } finally {
      setReinicio((n) => n + 1);
    }
  });

  return (
    <Tarjeta titulo="Recuperar contraseña">
      {exito ? (
        <Aviso tipo="exito">{exito}</Aviso>
      ) : (
        <form onSubmit={alEnviar}>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Campo
            etiqueta="Correo de tu cuenta"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <div className="mb-4">
            <Turnstile onToken={setCaptcha} reinicio={reinicio} />
          </div>
          <Boton cargando={enviando} disabled={!captcha}>
            Enviar enlace
          </Boton>
        </form>
      )}
      <p className="mt-5 text-sm">
        <Enlace href="/iniciar-sesion">Volver a iniciar sesión</Enlace>
      </p>
    </Tarjeta>
  );
}
