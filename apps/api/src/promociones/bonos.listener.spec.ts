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

  it('un error no llega al emisor del evento', async () => {
    const { listener, bonos } = preparar();
    bonos.otorgarPorDeposito.mockRejectedValue(new Error('billetera caída'));

    await expect(listener.alConfirmarDeposito(deposito)).resolves.toBeUndefined();
  });
});
