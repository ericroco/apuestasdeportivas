import type { RespuestaSalud } from '@apuestas/shared';
import { describe, expect, it, vi } from 'vitest';
import { consultarSalud, obtenerEstadoSistema, resumirSalud } from './salud';

const SALUD_OK: RespuestaSalud = {
  estado: 'ok',
  servicio: 'api',
  version: '0.1.0',
  fecha: '2026-11-14T18:00:00.000Z',
  dependencias: {
    baseDeDatos: { estado: 'ok', latenciaMs: 3 },
    cache: { estado: 'ok', latenciaMs: 1 },
  },
};

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('consultarSalud', () => {
  it('devuelve la salud cuando el servicio responde 200', async () => {
    const fetcher = vi.fn().mockResolvedValue(respuestaJson(SALUD_OK));

    const salud = await consultarSalud('http://api:3001', { fetcher });

    expect(salud).toEqual(SALUD_OK);
    expect(fetcher).toHaveBeenCalledWith(
      'http://api:3001/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('devuelve la salud también cuando el servicio responde 503 con el cuerpo del contrato', async () => {
    const caida = {
      ...SALUD_OK,
      estado: 'error',
      dependencias: { baseDeDatos: { estado: 'error', latenciaMs: 2000 } },
    };
    const fetcher = vi.fn().mockResolvedValue(respuestaJson(caida, 503));

    const salud = await consultarSalud('http://api:3001', { fetcher });

    expect(salud?.estado).toBe('error');
  });

  it('devuelve null cuando el servicio no responde', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(consultarSalud('http://api:3001', { fetcher })).resolves.toBeNull();
  });

  it('devuelve null cuando la respuesta no cumple el contrato', async () => {
    const fetcher = vi.fn().mockResolvedValue(respuestaJson({ estado: 'quizas', otra: 1 }));

    await expect(consultarSalud('http://api:3001', { fetcher })).resolves.toBeNull();
  });

  it('devuelve null cuando la fecha no es una fecha válida', async () => {
    const fetcher = vi.fn().mockResolvedValue(respuestaJson({ ...SALUD_OK, fecha: 'ayer' }));

    await expect(consultarSalud('http://api:3001', { fetcher })).resolves.toBeNull();
  });

  it('cancela la consulta cuando supera el tiempo máximo', async () => {
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(new Error('abortado')));
        }),
    );

    await expect(consultarSalud('http://api:3001', { fetcher, timeoutMs: 10 })).resolves.toBeNull();
  });

  it('no duplica la barra final de la URL base', async () => {
    const fetcher = vi.fn().mockResolvedValue(respuestaJson(SALUD_OK));

    await consultarSalud('http://api:3001/', { fetcher });

    expect(fetcher.mock.calls[0]?.[0]).toBe('http://api:3001/health');
  });
});

describe('obtenerEstadoSistema', () => {
  it('consulta la API y reportes en paralelo con las URLs del entorno', async () => {
    const fetcher = vi.fn().mockResolvedValue(respuestaJson(SALUD_OK));

    const estado = await obtenerEstadoSistema(
      { API_URL: 'http://api.interna', REPORTS_URL: 'http://reportes.interna' },
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledWith('http://api.interna/health', expect.anything());
    expect(fetcher).toHaveBeenCalledWith('http://reportes.interna/health', expect.anything());
    expect(estado.api).toEqual(SALUD_OK);
  });

  it('usa los puertos locales por defecto', async () => {
    const fetcher = vi.fn().mockResolvedValue(respuestaJson(SALUD_OK));

    await obtenerEstadoSistema({}, { fetcher });

    expect(fetcher).toHaveBeenCalledWith('http://localhost:3001/health', expect.anything());
    expect(fetcher).toHaveBeenCalledWith('http://localhost:8000/health', expect.anything());
  });
});

describe('resumirSalud', () => {
  it('resume un servicio sano como operativo con nombres legibles de dependencias', () => {
    expect(resumirSalud(SALUD_OK)).toEqual({
      situacion: 'operativo',
      version: '0.1.0',
      dependencias: [
        { clave: 'baseDeDatos', nombre: 'Base de datos', ok: true, latenciaMs: 3 },
        { clave: 'cache', nombre: 'Caché', ok: true, latenciaMs: 1 },
      ],
    });
  });

  it('resume un servicio con una dependencia caída como no disponible', () => {
    const resumen = resumirSalud({
      ...SALUD_OK,
      estado: 'error',
      dependencias: { baseDeDatos: { estado: 'error', latenciaMs: 2000 } },
    });

    expect(resumen.situacion).toBe('caido');
    expect(resumen.dependencias[0]?.ok).toBe(false);
  });

  it('resume un servicio que no contestó como sin respuesta y sin dependencias', () => {
    expect(resumirSalud(null)).toEqual({
      situacion: 'sin-respuesta',
      version: null,
      dependencias: [],
    });
  });

  it('usa la clave tal cual si la dependencia no tiene nombre conocido', () => {
    const resumen = resumirSalud({
      ...SALUD_OK,
      dependencias: { colas: { estado: 'ok', latenciaMs: 2 } },
    });

    expect(resumen.dependencias[0]?.nombre).toBe('colas');
  });
});
