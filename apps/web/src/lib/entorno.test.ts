import { describe, expect, it } from 'vitest';
import { leerEntornoServidor } from './entorno';

const SECRETO = 'a'.repeat(32);

describe('leerEntornoServidor', () => {
  it('aplica los valores por defecto y devuelve un objeto inmutable', () => {
    const entorno = leerEntornoServidor({
      WEB_PROXY_SECRETO: SECRETO,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    });

    expect(entorno).toEqual({
      API_URL: 'http://localhost:3001',
      WEB_PROXY_SECRETO: SECRETO,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    });
    expect(Object.isFrozen(entorno)).toBe(true);
  });

  it('quita la barra final de API_URL', () => {
    const entorno = leerEntornoServidor({
      API_URL: 'https://api.example.app/',
      WEB_PROXY_SECRETO: SECRETO,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'clave',
    });

    expect(entorno.API_URL).toBe('https://api.example.app');
  });

  it('exige WEB_PROXY_SECRETO de al menos 32 caracteres sin mostrar su valor', () => {
    const ejecutar = () =>
      leerEntornoServidor({ WEB_PROXY_SECRETO: 'corto', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'clave' });

    expect(ejecutar).toThrow(/WEB_PROXY_SECRETO/);
    expect(ejecutar).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('corto') }),
    );
  });

  it('exige NEXT_PUBLIC_TURNSTILE_SITE_KEY', () => {
    expect(() => leerEntornoServidor({ WEB_PROXY_SECRETO: SECRETO })).toThrow(
      /NEXT_PUBLIC_TURNSTILE_SITE_KEY/,
    );
  });

  it('rechaza una API_URL que no es http ni https', () => {
    expect(() =>
      leerEntornoServidor({
        API_URL: 'ftp://api',
        WEB_PROXY_SECRETO: SECRETO,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'clave',
      }),
    ).toThrow(/API_URL/);
  });
});
