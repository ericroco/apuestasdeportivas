import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import {
  LIMITE_VISTA_PREVIA,
  LimiteVistaPreviaGuard,
  VENTANA_VISTA_PREVIA_MS,
} from './limite-vista-previa.guard.js';

function contexto(usuario: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
  } as unknown as ExecutionContext;
}

function almacen(bloqueado: boolean) {
  return {
    increment: vi.fn().mockResolvedValue({
      totalHits: bloqueado ? LIMITE_VISTA_PREVIA + 1 : 1,
      timeToExpire: 60,
      isBlocked: bloqueado,
      timeToBlockExpire: bloqueado ? 60 : 0,
    }),
  };
}

const APOSTADOR = { id: 'u-1', email: 'a@example.com', roles: ['APOSTADOR'] };

describe('LimiteVistaPreviaGuard', () => {
  it('cuenta las consultas por usuario (no por IP) en una ventana de un minuto', async () => {
    const almacenFalso = almacen(false);
    const guard = new LimiteVistaPreviaGuard(almacenFalso as unknown as ThrottlerStorage);

    await expect(guard.canActivate(contexto(APOSTADOR))).resolves.toBe(true);
    expect(almacenFalso.increment).toHaveBeenCalledWith(
      'vista-previa:u-1',
      VENTANA_VISTA_PREVIA_MS,
      LIMITE_VISTA_PREVIA,
      VENTANA_VISTA_PREVIA_MS,
      'vista-previa',
    );
  });

  it('pasado el límite responde 429', async () => {
    const guard = new LimiteVistaPreviaGuard(almacen(true) as unknown as ThrottlerStorage);

    await expect(guard.canActivate(contexto(APOSTADOR))).rejects.toThrow(ThrottlerException);
  });

  it('sin usuario falla cerrado (401)', async () => {
    const guard = new LimiteVistaPreviaGuard(almacen(false) as unknown as ThrottlerStorage);

    await expect(guard.canActivate(contexto(undefined))).rejects.toThrow(UnauthorizedException);
  });
});
