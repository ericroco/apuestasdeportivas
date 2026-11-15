import type { Logger } from '@nestjs/common';
import { ejecutarSinPropagar } from './eventos.js';

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
