import type { Logger } from '@nestjs/common';
import { conReintentos, ejecutarSinPropagar, esErrorTransitorio } from './eventos.js';

function crearLogger() {
  return { error: vi.fn(), warn: vi.fn() } as unknown as Logger & {
    error: ReturnType<typeof vi.fn>;
  };
}

describe('ejecutarSinPropagar', () => {
  it('ejecuta la tarea', async () => {
    const tarea = vi.fn().mockResolvedValue(undefined);

    await ejecutarSinPropagar(crearLogger(), 'deposito.confirmado', tarea);

    expect(tarea).toHaveBeenCalledOnce();
  });

  it('registra el error con el Logger y no lo propaga al emisor', async () => {
    const logger = crearLogger();

    await expect(
      ejecutarSinPropagar(logger, 'apuesta.liquidada', () => Promise.reject(new Error('caída'))),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('apuesta.liquidada: caída'),
      expect.any(String),
    );
  });
});

const conCodigo = (codigo: string, extra: object = {}) =>
  Object.assign(new Error('falla'), { code: codigo, ...extra });

describe('esErrorTransitorio', () => {
  it.each([
    ['timeout de la transacción', conCodigo('P2028')],
    ['timeout del pool', conCodigo('P2024')],
    ['conflicto de escritura o deadlock de Prisma', conCodigo('P2034')],
    ['base inaccesible', conCodigo('P1001')],
    ['serialización en SQL crudo', conCodigo('P2010', { meta: { code: '40001' } })],
    ['deadlock en SQL crudo', conCodigo('P2010', { meta: { code: '40P01' } })],
    ['código de PostgreSQL en la causa', new Error('x', { cause: { code: '40P01' } })],
    ['conexión reiniciada', new Error('x', { cause: conCodigo('ECONNRESET') })],
  ])('reconoce %s', (_nombre, error) => {
    expect(esErrorTransitorio(error)).toBe(true);
  });

  it.each([
    ['unicidad', conCodigo('P2002')],
    ['un Error común', new Error('boom')],
    ['un valor que no es Error', 'texto'],
    ['null', null],
  ])('no reconoce %s', (_nombre, error) => {
    expect(esErrorTransitorio(error)).toBe(false);
  });
});

describe('conReintentos', () => {
  const dormir = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => dormir.mockClear());

  it('reintenta con espera creciente hasta que la tarea funciona', async () => {
    const tarea = vi
      .fn()
      .mockRejectedValueOnce(conCodigo('P2028'))
      .mockRejectedValueOnce(conCodigo('P2024'))
      .mockResolvedValue('listo');

    await expect(conReintentos(tarea, { dormir })).resolves.toBe('listo');

    expect(tarea).toHaveBeenCalledTimes(3);
    expect(dormir.mock.calls).toEqual([[200], [1000]]);
  });

  it('no reintenta un error que no es transitorio', async () => {
    const tarea = vi.fn().mockRejectedValue(new Error('definitivo'));

    await expect(conReintentos(tarea, { dormir })).rejects.toThrow('definitivo');

    expect(tarea).toHaveBeenCalledOnce();
    expect(dormir).not.toHaveBeenCalled();
  });

  it('tras agotar los reintentos lanza el último error', async () => {
    const tarea = vi.fn().mockRejectedValue(conCodigo('P2028'));

    await expect(conReintentos(tarea, { dormir })).rejects.toMatchObject({ code: 'P2028' });

    expect(tarea).toHaveBeenCalledTimes(4);
    expect(dormir.mock.calls).toEqual([[200], [1000], [3000]]);
  });
});

describe('ejecutarSinPropagar con reintentos', () => {
  it('reintenta lo transitorio y registra el contexto si se agota', async () => {
    const logger = crearLogger();
    const dormir = vi.fn().mockResolvedValue(undefined);
    const tarea = vi.fn().mockRejectedValue(conCodigo('P2028'));

    await ejecutarSinPropagar(logger, 'deposito.confirmado', tarea, {
      contexto: 'depositoId=dep-1 usuarioId=u-1',
      dormir,
    });

    expect(tarea).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('deposito.confirmado (depositoId=dep-1 usuarioId=u-1)'),
      expect.any(String),
    );
  });
});
