import { describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';
import { crearClienteApi } from './api';
import type { Fetcher } from './http';

const ESQUEMA = z.object({ id: z.string(), canjes: z.number() });
const TOKEN = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSJ9.firma-de_prueba';

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function cliente(fetcher: Mock<Fetcher>, token: string | null = TOKEN) {
  return crearClienteApi({ urlBase: 'http://api.interna/', token, fetcher });
}

function cabeceras(fetcher: Mock<Fetcher>): Headers {
  const init = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('crearClienteApi', () => {
  it('sin token responde "sin sesión" y no llama a la API', async () => {
    const fetcher = vi.fn<Fetcher>();

    const resultado = await cliente(fetcher, null).obtener('/api/cupones/1', ESQUEMA);

    expect(resultado).toEqual({ tipo: 'sin-sesion' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rechaza un token con caracteres que podrían inyectar otra cookie', async () => {
    const fetcher = vi.fn<Fetcher>();

    const resultado = await cliente(fetcher, 'abc; rol=ADMINISTRADOR').obtener('/x', ESQUEMA);

    expect(resultado).toEqual({ tipo: 'sin-sesion' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reenvía la cookie acceso desde el servidor, sin caché y sin duplicar la barra', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(respuestaJson({ id: 'c1', canjes: 0 }));

    const resultado = await cliente(fetcher).obtener('/api/cupones/c1', ESQUEMA);

    expect(resultado).toEqual({ tipo: 'ok', datos: { id: 'c1', canjes: 0 } });
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://api.interna/api/cupones/c1');
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ cache: 'no-store' }));
    expect(cabeceras(fetcher).get('cookie')).toBe(`acceso=${TOKEN}`);
    expect(cabeceras(fetcher).get('authorization')).toBeNull();
  });

  it('envía el cuerpo como JSON en POST y PATCH', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(respuestaJson({ id: 'c1', canjes: 0 }, 201));

    await cliente(fetcher).enviar('PATCH', '/api/cupones/c1', { estado: 'PAUSADO' }, ESQUEMA);

    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"estado":"PAUSADO"}');
    expect(cabeceras(fetcher).get('content-type')).toBe('application/json');
  });

  it.each([
    [401, { tipo: 'sin-sesion' }],
    [403, { tipo: 'sin-permiso' }],
    [500, { tipo: 'no-disponible' }],
  ])('traduce el estado %i', async (estado, esperado) => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(respuestaJson({ message: 'x' }, estado));

    await expect(cliente(fetcher).obtener('/x', ESQUEMA)).resolves.toEqual(esperado);
  });

  it('traduce 503 con el código del contrato a "no disponible"', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        respuestaJson({ statusCode: 503, codigo: 'DEPENDENCIA_NO_DISPONIBLE', message: 'x' }, 503),
      );

    await expect(cliente(fetcher).obtener('/x', ESQUEMA)).resolves.toEqual({
      tipo: 'no-disponible',
      codigo: 'DEPENDENCIA_NO_DISPONIBLE',
    });
  });

  it('devuelve el código y el mensaje de un rechazo del contrato', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      respuestaJson(
        {
          statusCode: 409,
          error: 'Conflict',
          codigo: 'CODIGO_DUPLICADO',
          message: 'Ya existe un cupón con ese código.',
        },
        409,
      ),
    );

    const resultado = await cliente(fetcher).enviar('POST', '/api/cupones', {}, ESQUEMA);

    expect(resultado).toEqual({
      tipo: 'rechazo',
      estado: 409,
      codigo: 'CODIGO_DUPLICADO',
      mensaje: 'Ya existe un cupón con ese código.',
    });
  });

  it('une los mensajes cuando la API devuelve una lista', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        respuestaJson({ codigo: 'DATOS_INVALIDOS', message: ['cupoTotal', 'terminaEn'] }, 400),
      );

    const resultado = await cliente(fetcher).obtener('/x', ESQUEMA);

    expect(resultado).toEqual(expect.objectContaining({ mensaje: 'cupoTotal. terminaEn' }));
  });

  it('usa NO_ENCONTRADO en un 404 sin cuerpo del contrato', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response('no', { status: 404 }));

    const resultado = await cliente(fetcher).obtener('/x', ESQUEMA);

    expect(resultado).toEqual(
      expect.objectContaining({ tipo: 'rechazo', estado: 404, codigo: 'NO_ENCONTRADO' }),
    );
  });

  it('trata una respuesta que no cumple el contrato como "no disponible"', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(respuestaJson({ id: 1 }));

    await expect(cliente(fetcher).obtener('/x', ESQUEMA)).resolves.toEqual({
      tipo: 'no-disponible',
    });
  });

  it('trata un cuerpo que no es JSON como "no disponible"', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response('<html>', { status: 200 }));

    await expect(cliente(fetcher).obtener('/x', ESQUEMA)).resolves.toEqual({
      tipo: 'no-disponible',
    });
  });

  it('trata la falta de respuesta como "no disponible"', async () => {
    const fetcher = vi.fn<Fetcher>().mockRejectedValue(new TypeError('fetch failed'));

    await expect(cliente(fetcher).obtener('/x', ESQUEMA)).resolves.toEqual({
      tipo: 'no-disponible',
    });
  });

  it('cancela la consulta cuando supera el tiempo máximo', async () => {
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(new Error('abortado')));
        }),
    );
    const lento = crearClienteApi({ urlBase: 'http://api', token: TOKEN, fetcher, timeoutMs: 10 });

    await expect(lento.obtener('/x', ESQUEMA)).resolves.toEqual({ tipo: 'no-disponible' });
  });
});
