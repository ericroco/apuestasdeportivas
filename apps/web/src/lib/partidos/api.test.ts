import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '@/lib/api-cliente';
import { apostar, cuotasVigentesDe, listarPartidos, obtenerPartido } from './api';

const PARTIDO = {
  id: 'p1',
  competicion: { id: 'c1', nombre: 'LigaPro', pais: 'Ecuador' },
  nombreLocal: 'Barcelona SC',
  nombreVisitante: 'Emelec',
  inicioEn: '2026-11-20T20:00:00.000Z',
  estado: 'PROGRAMADO',
  golesLocal: null,
  golesVisitante: null,
  minuto: null,
};

function responder(estado: number, cuerpo: unknown) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(cuerpo), {
          status: estado,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente REST del Spec 3', () => {
  it('lista la cartelera por el proxy de la web, con los filtros en la consulta', async () => {
    responder(200, { elementos: [PARTIDO], pagina: 1, porPagina: 20, total: 1 });

    const pagina = await listarPartidos({ estado: 'EN_VIVO', pagina: 2 });

    expect(pagina.elementos[0]?.nombreLocal).toBe('Barcelona SC');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/partidos?estado=EN_VIVO&pagina=2');
  });

  it('rechaza una respuesta con forma inesperada en lugar de mostrar datos raros', async () => {
    responder(200, { ...PARTIDO, version: 'no-es-numero', mercados: [] });

    await expect(obtenerPartido('p1')).rejects.toMatchObject({ estado: 502 });
  });

  it('distingue una apuesta aceptada de una en vivo que queda en espera', async () => {
    responder(202, { solicitudId: 's1', ejecutarEn: '2026-11-15T20:00:05.000Z' });

    await expect(
      apostar({
        claveSolicitud: 'k',
        monto: '10.00',
        selecciones: [{ seleccionId: 'x', cuotaVista: '1.80' }],
      }),
    ).resolves.toEqual({
      tipo: 'en-espera',
      solicitud: { solicitudId: 's1', ejecutarEn: '2026-11-15T20:00:05.000Z' },
    });
  });

  it('expone el código y las cuotas vigentes de un rechazo CUOTA_CAMBIADA', async () => {
    responder(409, {
      statusCode: 409,
      error: 'Conflict',
      codigo: 'CUOTA_CAMBIADA',
      message: 'La cuota cambió.',
      cuotasVigentes: [{ seleccionId: 'x', cuota: '2.40' }],
    });

    const error = await apostar({
      claveSolicitud: 'k',
      monto: '10.00',
      selecciones: [{ seleccionId: 'x', cuotaVista: '2.10' }],
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).codigo).toBe('CUOTA_CAMBIADA');
    expect(cuotasVigentesDe(error)).toEqual(new Map([['x', '2.40']]));
    expect(cuotasVigentesDe(new ErrorApi(422, 'otro'))).toBeNull();
  });
});
