'use client';

import { useState } from 'react';
import { Turnstile } from '@/components/turnstile';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

/** HU1: registro con mayoría de edad y CAPTCHA. La API valida todo de nuevo (principio III). */
export default function PaginaRegistro() {
  const { enviando, error, exito, enviar } = useFormulario();
  const [captcha, setCaptcha] = useState('');
  const [reinicio, setReinicio] = useState(0);

  const alEnviar = enviar(async (datos) => {
    try {
      const respuesta = await api<{ mensaje: string }>('/identidad/registro', {
        metodo: 'POST',
        cuerpo: {
          nombreCompleto: texto(datos, 'nombreCompleto'),
          email: texto(datos, 'email'),
          contrasena: texto(datos, 'contrasena'),
          fechaNacimiento: texto(datos, 'fechaNacimiento'),
          declaraMayorEdad: datos.get('declaraMayorEdad') === 'on',
          captcha,
        },
      });
      return respuesta.mensaje;
    } finally {
      setReinicio((n) => n + 1);
    }
  });

  return (
    <Tarjeta titulo="Crear cuenta">
      {exito ? (
        <>
          <Aviso tipo="exito">{exito}</Aviso>
          <p className="text-sm">
            Cuando confirmes tu correo, <Enlace href="/iniciar-sesion">inicia sesión</Enlace>.
          </p>
        </>
      ) : (
        <form onSubmit={alEnviar} noValidate={false}>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Campo
            etiqueta="Nombre completo"
            name="nombreCompleto"
            autoComplete="name"
            required
            minLength={3}
          />
          <Campo etiqueta="Correo" name="email" type="email" autoComplete="email" required />
          <Campo
            etiqueta="Contraseña"
            name="contrasena"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            ayuda="Al menos 12 caracteres. Evita contraseñas comunes y no uses tu correo."
          />
          <Campo
            etiqueta="Fecha de nacimiento"
            name="fechaNacimiento"
            type="date"
            autoComplete="bday"
            required
            ayuda="Debes ser mayor de 18 años."
          />
          <label className="mb-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="declaraMayorEdad" required className="mt-1 size-4" />
            <span>Declaro que soy mayor de edad y acepto jugar de forma responsable.</span>
          </label>
          <div className="mb-4">
            <Turnstile onToken={setCaptcha} reinicio={reinicio} />
          </div>
          <Boton cargando={enviando} disabled={!captcha}>
            Crear cuenta
          </Boton>
          <p className="mt-5 text-sm">
            ¿Ya tienes cuenta? <Enlace href="/iniciar-sesion">Inicia sesión</Enlace>
          </p>
        </form>
      )}
    </Tarjeta>
  );
}
