'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        elemento: HTMLElement,
        opciones: {
          sitekey: string;
          language: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        },
      ) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

const URL_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let cargando: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  cargando ??= new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = URL_SCRIPT;
    script.async = true;
    script.onload = () => resolver();
    script.onerror = () => rechazar(new Error('No se pudo cargar la verificación'));
    document.head.appendChild(script);
  });
  return cargando;
}

/**
 * CAPTCHA de Cloudflare Turnstile (FR-001, FR-008, FR-067). Entrega el token al formulario; el servidor lo
 * verifica. `reinicio` cambia para pedir un token nuevo tras un envío (cada token sirve una vez).
 */
export function Turnstile({
  onToken,
  reinicio = 0,
}: {
  onToken: (token: string) => void;
  reinicio?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const alCambiar = useRef(onToken);
  useEffect(() => {
    alCambiar.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let vivo = true;
    void cargarScript()
      .then(() => {
        if (!vivo || !contenedor.current || !window.turnstile) return;
        widget.current = window.turnstile.render(contenedor.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
          language: 'es',
          callback: (token) => alCambiar.current(token),
          'expired-callback': () => alCambiar.current(''),
          'error-callback': () => alCambiar.current(''),
        });
      })
      .catch(() => alCambiar.current(''));
    return () => {
      vivo = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (reinicio > 0 && widget.current) {
      alCambiar.current('');
      window.turnstile?.reset(widget.current);
    }
  }, [reinicio]);

  return (
    <div
      ref={contenedor}
      className="min-h-[65px]"
      aria-label="Verificación de que no eres un robot"
    />
  );
}
