// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJhZG1pbiJ9.firma';
let cookieAcceso: string | undefined = TOKEN;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      nombre === 'acceso' && cookieAcceso ? { name: nombre, value: cookieAcceso } : undefined,
  }),
}));

const { GET } = await import('./route');

const URL_EXPORTAR =
  'http://web.local/admin/reportes/exportar?formato=csv&desde=2026-12-01&hasta=2026-12-31&deporte=futbol';

describe('GET /admin/reportes/exportar', () => {
  const fetchSimulado = vi.fn<typeof fetch>();

  beforeEach(() => {
    cookieAcceso = TOKEN;
    vi.stubEnv('REPORTS_URL', 'http://reportes.interna');
    vi.stubGlobal('fetch', fetchSimulado);
  });

  afterEach(() => {
    fetchSimulado.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('pide el archivo a reportes con Bearer desde el servidor y lo transmite como descarga', async () => {
    fetchSimulado.mockResolvedValue(
      new Response('﻿Resumen;Volumen\n', {
        headers: { 'content-type': 'text/csv; charset=utf-8' },
      }),
    );

    const respuesta = await GET(new Request(URL_EXPORTAR));

    const [url, init] = fetchSimulado.mock.calls[0]!;
    expect(url).toBe(
      'http://reportes.interna/reportes/exportar?desde=2026-12-01&hasta=2026-12-31&deporte=futbol&formato=csv',
    );
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(respuesta.headers.get('content-disposition')).toBe(
      'attachment; filename="reporte-2026-12-01-2026-12-31.csv"',
    );
    expect(respuesta.headers.get('cache-control')).toBe('private, no-store');
    expect(await respuesta.text()).toContain('Resumen;Volumen');
  });

  it('sin cookie vuelve al dashboard sin consultar reportes', async () => {
    cookieAcceso = undefined;

    const respuesta = await GET(new Request(URL_EXPORTAR));

    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get('location')).toBe(
      'http://web.local/admin/reportes?desde=2026-12-01&hasta=2026-12-31&deporte=futbol&exportacion=sin-sesion',
    );
  });

  it('vuelve al dashboard con el motivo si reportes niega el permiso', async () => {
    fetchSimulado.mockResolvedValue(
      Response.json({ detail: { codigo: 'SIN_PERMISO', mensaje: 'x' } }, { status: 403 }),
    );

    const respuesta = await GET(new Request(URL_EXPORTAR));

    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get('location')).toContain('exportacion=sin-permiso');
  });

  it('rechaza un formato que no es CSV ni PDF', async () => {
    const respuesta = await GET(new Request(URL_EXPORTAR.replace('formato=csv', 'formato=xlsx')));

    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(respuesta.headers.get('location')).toContain('exportacion=filtros');
  });

  it('rechaza filtros con formato inválido', async () => {
    const respuesta = await GET(new Request(URL_EXPORTAR.replace('2026-12-31', '2026-02-30')));

    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(respuesta.headers.get('location')).toContain('exportacion=filtros');
  });
});
