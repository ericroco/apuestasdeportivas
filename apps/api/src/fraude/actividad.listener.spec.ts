import { ActividadListener } from './actividad.listener.js';
import type { ActividadService } from './actividad.service.js';

function preparar() {
  const actividad = { registrar: vi.fn().mockResolvedValue(true) };
  return { actividad, listener: new ActividadListener(actividad as unknown as ActividadService) };
}

describe('ActividadListener', () => {
  it('registra cada uno de los cinco eventos con su tipo de actividad', async () => {
    const { listener, actividad } = preparar();

    await listener.alRegistrarUsuario({ usuarioId: 'u-1', ip: '203.0.113.1', dispositivo: 'd-1' });
    await listener.alConfirmarDeposito({
      usuarioId: 'u-1',
      depositoId: 'dep-1',
      monto: '20',
      codigoCupon: null,
    });
    await listener.alSolicitarRetiro({ usuarioId: 'u-1', retiroId: 'ret-1', monto: '5' });
    await listener.alAceptarApuesta({
      usuarioId: 'u-1',
      apuestaId: 'ap-1',
      monto: '5',
      tipoSaldo: 'REAL',
    });
    await listener.alLiquidarApuesta({
      usuarioId: 'u-1',
      apuestaId: 'ap-1',
      resultado: 'PERDIDA',
      monto: '5',
      premio: '0',
    });

    expect(actividad.registrar.mock.calls.map(([entrada]) => entrada.tipo)).toEqual([
      'REGISTRO',
      'DEPOSITO',
      'RETIRO',
      'APUESTA_ACEPTADA',
      'APUESTA_LIQUIDADA',
    ]);
  });

  it('un evento mal formado no se registra ni lanza al emisor', async () => {
    const { listener, actividad } = preparar();

    await expect(
      listener.alSolicitarRetiro({ usuarioId: 'u-1', retiroId: 'ret-1', monto: 'diez' }),
    ).resolves.toBeUndefined();
    expect(actividad.registrar).not.toHaveBeenCalled();
  });

  it('una falla de la base no llega al emisor', async () => {
    const { listener, actividad } = preparar();
    actividad.registrar.mockRejectedValue(new Error('sin conexión'));

    await expect(
      listener.alRegistrarUsuario({ usuarioId: 'u-1', ip: '203.0.113.1', dispositivo: 'd-1' }),
    ).resolves.toBeUndefined();
  });
});
