import { describe, expect, it, vi, type Mock } from 'vitest';
import { COMPETICIONES, RESUMEN, SERIE } from '@/test/fixtures-reportes';
import type { Fetcher } from './http';
import { crearClienteReportes, obtenerTablero } from './reportes';

const TOKEN = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJhZG1pbiJ9.firma';
const FILTROS = { desde: '2026-12-01', hasta: '2026-12-31', competicionId: undefined };

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function cliente(fetcher: Mock<Fetcher>, token: string | null = TOKEN) {
  return crearClienteReportes({ urlBase: 'http://reportes.interna', token, fetcher });
}

function cabeceras(fetcher: Mock<Fetcher>, llamada = 0): Headers {
  return new Headers(fetcher.mock.calls[llamada]?.[1]?.headers);
}

describe('crearClienteReportes', () => {
  it('envía el token como Bearer desde el servidor, nunca como cookie', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(respuestaJson(RESUMEN));

    const resultado = await cliente(fetcher).resumen({ ...FILTROS, usuario: 'ana@correo.ec' });

    expect(resultado).toEqual({
      tipo: 'ok',
      datos: expect.objectContaining({ generadoEn: RESUMEN.generadoEn }),
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'http://reportes.interna/reportes/resumen?desde=2026-12-01&hasta=2026-12-31&usuario=ana%40correo.ec',
    );
    expect(cabeceras(fetcher).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(cabeceras(fetcher).get('cookie')).toBeNull();
  });

  it('sin token no consulta reportes', async () => {
    const fetcher = vi.fn<Fetcher>();

    await expect(cliente(fetcher, null).serieDiaria(FILTROS)).resolves.toEqual({
      tipo: 'sin-sesion',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('pide la serie diaria y el desglose por competición', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(respuestaJson(SERIE))
      .mockResolvedValueOnce(respuestaJson(COMPETICIONES));

    const serie = await cliente(fetcher).serieDiaria(FILTROS);
    const competiciones = await cliente(fetcher).competiciones(FILTROS);

    expect(fetcher.mock.calls[0]?.[0]).toContain('/reportes/serie-diaria?');
    expect(fetcher.mock.calls[1]?.[0]).toContain('/reportes/competiciones?');
    expect(serie.tipo === 'ok' && serie.datos.dias).toHaveLength(3);
    expect(competiciones.tipo === 'ok' && competiciones.datos.competiciones[0]?.nombre).toBe(
      'LigaPro',
    );
  });

  it.each([
    [401, { detail: { codigo: 'TOKEN_INVALIDO', mensaje: 'x' } }, { tipo: 'sin-sesion' }],
    [403, { detail: { codigo: 'SIN_PERMISO', mensaje: 'x' } }, { tipo: 'sin-permiso' }],
    [
      503,
      { detail: { codigo: 'DATOS_NO_DISPONIBLES', mensaje: 'x' } },
      { tipo: 'no-disponible', codigo: 'DATOS_NO_DISPONIBLES' },
    ],
  ])('traduce %i con el formato de error de reportes', async (estado, cuerpo, esperado) => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(respuestaJson(cuerpo, estado));

    await expect(cliente(fetcher).resumen(FILTROS)).resolves.toEqual(esperado);
  });

  it('muestra el mensaje de reportes cuando rechaza los filtros', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      respuestaJson(
        {
          detail: { codigo: 'FILTROS_INVALIDOS', mensaje: 'El rango no puede superar 366 días.' },
        },
        400,
      ),
    );

    await expect(cliente(fetcher).resumen(FILTROS)).resolves.toEqual({
      tipo: 'rechazo',
      estado: 400,
      codigo: 'FILTROS_INVALIDOS',
      mensaje: 'El rango no puede superar 366 días.',
    });
  });

  it('trata la validación por defecto de FastAPI (422) como filtros inválidos', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        respuestaJson({ detail: [{ loc: ['query', 'desde'], msg: 'Field required' }] }, 422),
      );

    const resultado = await cliente(fetcher).resumen(FILTROS);

    expect(resultado).toEqual(
      expect.objectContaining({ tipo: 'rechazo', codigo: 'FILTROS_INVALIDOS' }),
    );
  });

  it('no muestra un resumen incompleto', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(respuestaJson({ ...RESUMEN, apuestas: undefined }));

    await expect(cliente(fetcher).resumen(FILTROS)).resolves.toEqual({ tipo: 'no-disponible' });
  });
});

describe('exportar', () => {
  it('devuelve el archivo como flujo con un nombre armado a partir de los filtros', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response('﻿Resumen\n', {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="../../otro.csv"',
        },
      }),
    );

    const resultado = await cliente(fetcher).exportar(FILTROS, 'csv');

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'http://reportes.interna/reportes/exportar?desde=2026-12-01&hasta=2026-12-31&formato=csv',
    );
    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo !== 'ok') return;
    expect(resultado.datos.tipoContenido).toBe('text/csv; charset=utf-8');
    expect(resultado.datos.nombreArchivo).toBe('reporte-2026-12-01-2026-12-31.csv');
    expect(await new Response(resultado.datos.cuerpo).text()).toContain('Resumen');
  });

  it('rechaza un archivo con un tipo distinto al pedido', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } }));

    await expect(cliente(fetcher).exportar(FILTROS, 'pdf')).resolves.toEqual({
      tipo: 'no-disponible',
    });
  });

  it('traduce un 403 al exportar', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(respuestaJson({ detail: {} }, 403));

    await expect(cliente(fetcher).exportar(FILTROS, 'pdf')).resolves.toEqual({
      tipo: 'sin-permiso',
    });
  });
});

describe('obtenerTablero', () => {
  it('pide resumen, serie y desglose en paralelo', async () => {
    const fetcher = vi.fn<Fetcher>((url: string) =>
      Promise.resolve(
        respuestaJson(
          url.includes('resumen') ? RESUMEN : url.includes('serie') ? SERIE : COMPETICIONES,
        ),
      ),
    );

    const resultado = await obtenerTablero(cliente(fetcher), FILTROS);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(resultado.tipo === 'ok' && Object.keys(resultado.datos).sort()).toEqual([
      'competiciones',
      'resumen',
      'serie',
    ]);
  });

  it('si una parte falla no muestra las demás y prioriza la sesión', async () => {
    const fetcher = vi.fn<Fetcher>((url: string) =>
      Promise.resolve(
        url.includes('resumen')
          ? respuestaJson({}, 503)
          : url.includes('serie')
            ? respuestaJson({}, 401)
            : respuestaJson(COMPETICIONES),
      ),
    );

    await expect(obtenerTablero(cliente(fetcher), FILTROS)).resolves.toEqual({
      tipo: 'sin-sesion',
    });
  });
});
