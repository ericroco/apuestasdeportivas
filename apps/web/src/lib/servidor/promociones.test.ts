import { describe, expect, it, vi } from 'vitest';
import { ALERTA, CUPON, DETALLE_CUPON, MIS_BONOS } from '@/test/fixtures';
import type { ClienteApi } from './api';
import {
  actualizarCupon,
  crearCupon,
  listarAlertas,
  listarCupones,
  obtenerAlerta,
  obtenerCupon,
  obtenerMisBonos,
  resolverAlerta,
} from './promociones';

function clienteFalso(datos: unknown) {
  const obtener = vi.fn((_ruta: string, esquema: { safeParse: (d: unknown) => unknown }) =>
    Promise.resolve({ tipo: 'ok', datos: (esquema.safeParse(datos) as { data: unknown }).data }),
  );
  const enviar = vi.fn(
    (_m: string, _r: string, _c: unknown, esquema: { safeParse: (d: unknown) => unknown }) =>
      Promise.resolve({ tipo: 'ok', datos: (esquema.safeParse(datos) as { data: unknown }).data }),
  );
  return { api: { obtener, enviar } as unknown as ClienteApi, obtener, enviar };
}

describe('cupones', () => {
  it('lista con los filtros presentes y el tamaño de página', async () => {
    const { api, obtener } = clienteFalso({ datos: [CUPON], total: 1, pagina: 2, tamano: 20 });

    const resultado = await listarCupones(api, { estado: 'PAUSADO', busqueda: 'BIEN', pagina: 2 });

    expect(obtener.mock.calls[0]?.[0]).toBe(
      '/api/cupones?estado=PAUSADO&busqueda=BIEN&pagina=2&tamano=20',
    );
    expect(resultado).toEqual({
      tipo: 'ok',
      datos: { datos: [CUPON], total: 1, pagina: 2, tamano: 20 },
    });
  });

  it('pide el detalle con el identificador escapado', async () => {
    const { api, obtener } = clienteFalso(DETALLE_CUPON);

    await obtenerCupon(api, 'a/b');

    expect(obtener.mock.calls[0]?.[0]).toBe('/api/cupones/a%2Fb');
  });

  it('crea con POST y actualiza con PATCH', async () => {
    const { api, enviar } = clienteFalso(CUPON);
    const solicitud = {
      codigo: 'GRATIS5',
      tipo: 'APUESTA_GRATIS',
      montoFijo: '5.00',
      iniciaEn: '2026-12-01T05:00:00.000Z',
      terminaEn: '2026-12-31T05:00:00.000Z',
      cupoTotal: 10,
      limitePorUsuario: 1,
    } as const;

    await crearCupon(api, solicitud);
    await actualizarCupon(api, 'c1', { estado: 'PAUSADO' });

    expect(enviar.mock.calls[0]?.slice(0, 3)).toEqual(['POST', '/api/cupones', solicitud]);
    expect(enviar.mock.calls[1]?.slice(0, 3)).toEqual([
      'PATCH',
      '/api/cupones/c1',
      { estado: 'PAUSADO' },
    ]);
  });
});

describe('bonos', () => {
  it('pide los bonos del apostador de la sesión', async () => {
    const { api, obtener } = clienteFalso(MIS_BONOS);

    const resultado = await obtenerMisBonos(api);

    expect(obtener.mock.calls[0]?.[0]).toBe('/api/bonos/mios');
    expect(resultado).toEqual({ tipo: 'ok', datos: MIS_BONOS });
  });
});

describe('alertas', () => {
  it('lista con los días convertidos al rango UTC que entiende la API', async () => {
    const { api, obtener } = clienteFalso({ datos: [ALERTA], total: 1, pagina: 1, tamano: 20 });

    await listarAlertas(api, {
      estado: 'ABIERTA',
      severidad: 'ALTA',
      desde: '2026-12-01',
      hasta: '2026-12-31',
      pagina: 1,
    });

    expect(obtener.mock.calls[0]?.[0]).toBe(
      '/api/alertas?estado=ABIERTA&severidad=ALTA&desde=2026-12-01T00%3A00%3A00.000Z' +
        '&hasta=2026-12-31T23%3A59%3A59.999Z&pagina=1&tamano=20',
    );
  });

  it('pide el detalle y envía la resolución', async () => {
    const { api, obtener, enviar } = clienteFalso(ALERTA);

    await obtenerAlerta(api, 'a1');
    await resolverAlerta(api, 'a1', { estado: 'DESCARTADA', nota: 'Familia en la misma casa' });

    expect(obtener.mock.calls[0]?.[0]).toBe('/api/alertas/a1');
    expect(enviar.mock.calls[0]?.slice(0, 3)).toEqual([
      'POST',
      '/api/alertas/a1/resolucion',
      { estado: 'DESCARTADA', nota: 'Familia en la misma casa' },
    ]);
  });
});
