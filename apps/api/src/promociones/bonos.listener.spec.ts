import { Logger } from '@nestjs/common';
import type { ActividadService } from '../fraude/actividad.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { BonosListener } from './bonos.listener.js';
import type { BonosService } from './bonos.service.js';
import type { RolloverService } from './rollover.service.js';

function preparar() {
  const actividad = { registrar: vi.fn().mockResolvedValue(true) };
  const bonos = { otorgarPorDeposito: vi.fn().mockResolvedValue('OTORGADO') };
  const rollover = { recalcular: vi.fn().mockResolvedValue('EN_CURSO') };
  const listener = new BonosListener(
    actividad as unknown as ActividadService,
    bonos as unknown as BonosService,
    rollover as unknown as RolloverService,
  );
  return { listener, actividad, bonos, rollover };
}

const deposito = {
  usuarioId: 'u-1',
  depositoId: 'dep-1',
  monto: '20.00',
  codigoCupon: 'BIENVENIDA10',
  metodoPagoHuella: 'h-1',
};

describe('BonosListener', () => {
  it('deposito.confirmado registra la actividad y después aplica el cupón del depósito', async () => {
    const { listener, actividad, bonos } = preparar();

    await listener.alConfirmarDeposito(deposito);

    expect(actividad.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'DEPOSITO', referenciaId: 'dep-1' }),
    );
    expect(bonos.otorgarPorDeposito).toHaveBeenCalledWith({
      usuarioId: 'u-1',
      depositoId: 'dep-1',
      monto: new Prisma.Decimal('20'),
      codigoCupon: 'BIENVENIDA10',
      metodoPagoHuella: 'h-1',
    });
    expect(actividad.registrar.mock.invocationCallOrder[0]).toBeLessThan(
      bonos.otorgarPorDeposito.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('un depósito sin cupón solo registra la actividad', async () => {
    const { listener, bonos } = preparar();

    await listener.alConfirmarDeposito({ ...deposito, codigoCupon: null });

    expect(bonos.otorgarPorDeposito).not.toHaveBeenCalled();
  });

  it('apuesta.liquidada registra la liquidación y recalcula el rollover del usuario', async () => {
    const { listener, actividad, rollover } = preparar();

    await listener.alLiquidarApuesta({
      usuarioId: 'u-1',
      apuestaId: 'ap-1',
      resultado: 'GANADA',
      monto: '10',
      premio: '20',
    });

    expect(actividad.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'APUESTA_LIQUIDADA', referenciaId: 'ap-1' }),
    );
    expect(rollover.recalcular).toHaveBeenCalledWith('u-1');
  });

  describe('ante fallas de la base', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const transitorio = () => Object.assign(new Error('timeout de transacción'), { code: 'P2028' });

    it('reintenta una falla transitoria y el depósito termina con un solo bono', async () => {
      const { listener, bonos } = preparar();
      bonos.otorgarPorDeposito
        .mockRejectedValueOnce(transitorio())
        .mockRejectedValueOnce(transitorio())
        .mockResolvedValue('OTORGADO');

      const pendiente = listener.alConfirmarDeposito(deposito);
      await vi.runAllTimersAsync();
      await pendiente;

      expect(bonos.otorgarPorDeposito).toHaveBeenCalledTimes(3);
    });

    it('no reintenta un error que no es transitorio', async () => {
      const { listener, bonos } = preparar();
      bonos.otorgarPorDeposito.mockRejectedValue(new Error('billetera caída'));

      await listener.alConfirmarDeposito(deposito);

      expect(bonos.otorgarPorDeposito).toHaveBeenCalledOnce();
    });

    it('al agotar los reintentos registra el error con el depósito y el usuario', async () => {
      const { listener, bonos } = preparar();
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      bonos.otorgarPorDeposito.mockRejectedValue(transitorio());

      const pendiente = listener.alConfirmarDeposito(deposito);
      await vi.runAllTimersAsync();
      await pendiente;

      expect(bonos.otorgarPorDeposito).toHaveBeenCalledTimes(4);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('depositoId=dep-1 usuarioId=u-1'),
        expect.any(String),
      );
      error.mockRestore();
    });
  });

  it('un error no llega al emisor del evento', async () => {
    const { listener, bonos } = preparar();
    bonos.otorgarPorDeposito.mockRejectedValue(new Error('billetera caída'));

    await expect(listener.alConfirmarDeposito(deposito)).resolves.toBeUndefined();
  });
});
