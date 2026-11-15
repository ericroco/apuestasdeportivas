'use client';

import { type FormEvent, useState } from 'react';
import { ErrorApi } from './api-cliente';

/** Estado común de los formularios: envío, error legible de la API y mensaje de éxito. */
export function useFormulario() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function enviar(accion: (datos: FormData) => Promise<string | void>) {
    return async (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      setEnviando(true);
      setError(null);
      setExito(null);
      try {
        const mensaje = await accion(new FormData(evento.currentTarget));
        if (mensaje) setExito(mensaje);
      } catch (e) {
        setError(e instanceof ErrorApi ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
      } finally {
        setEnviando(false);
      }
    };
  }

  return { enviando, error, exito, enviar, setError };
}

export const texto = (datos: FormData, campo: string): string => String(datos.get(campo) ?? '');
