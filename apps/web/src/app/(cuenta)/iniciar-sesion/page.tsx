'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Turnstile } from '@/components/turnstile';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api, type Perfil } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

/** HU2 y HU6: correo y contraseña, y luego el código del segundo factor si está activo. */
export default function PaginaIniciarSesion() {
  const router = useRouter();
  const { enviando, error, enviar } = useFormulario();
  const [paso, setPaso] = useState<'credenciales' | 'codigo'>('credenciales');
  const [captcha, setCaptcha] = useState('');
  const [reinicio, setReinicio] = useState(0);

  async function entrar() {
    const perfil = await api<Perfil>('/identidad/yo');
    // Operador o administrador sin 2FA: solo puede activarlo (FR-021).
    router.push(perfil.alcance === 'activar-2fa' ? '/seguridad' : '/cuenta');
  }

  const alEnviarCredenciales = enviar(async (datos) => {
    try {
      const { estado } = await api<{ estado: 'INICIADA' | 'REQUIERE_2FA' }>('/identidad/sesion', {
        metodo: 'POST',
        cuerpo: { email: texto(datos, 'email'), contrasena: texto(datos, 'contrasena'), captcha },
      });
      if (estado === 'REQUIERE_2FA') setPaso('codigo');
      else await entrar();
    } finally {
      setReinicio((n) => n + 1);
    }
  });

  const alEnviarCodigo = enviar(async (datos) => {
    await api('/identidad/sesion/2fa', {
      metodo: 'POST',
      cuerpo: { codigo: texto(datos, 'codigo').replace(/\s/g, '') },
    });
    await entrar();
  });

  return (
    <Tarjeta titulo="Iniciar sesión">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {paso === 'credenciales' ? (
        <form onSubmit={alEnviarCredenciales}>
          <Campo etiqueta="Correo" name="email" type="email" autoComplete="email" required />
          <Campo
            etiqueta="Contraseña"
            name="contrasena"
            type="password"
            autoComplete="current-password"
            required
          />
          <div className="mb-4">
            <Turnstile onToken={setCaptcha} reinicio={reinicio} />
          </div>
          <Boton cargando={enviando} disabled={!captcha}>
            Iniciar sesión
          </Boton>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <Enlace href="/recuperar">Olvidé mi contraseña</Enlace>
            <p>
              ¿No tienes cuenta? <Enlace href="/registro">Crear cuenta</Enlace>
            </p>
          </div>
        </form>
      ) : (
        <form onSubmit={alEnviarCodigo}>
          <Campo
            etiqueta="Código de verificación"
            name="codigo"
            inputMode="text"
            autoComplete="one-time-code"
            required
            autoFocus
            ayuda="Escribe el código de 6 dígitos de tu aplicación o uno de tus códigos de recuperación."
          />
          <Boton cargando={enviando}>Verificar código</Boton>
        </form>
      )}
    </Tarjeta>
  );
}
