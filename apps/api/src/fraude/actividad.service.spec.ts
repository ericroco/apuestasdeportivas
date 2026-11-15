import type { Reloj } from '../comun/reloj.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  EventoInvalidoError,
  desdeApuestaAceptada,
  desdeApuestaLiquidada,
  desdeDepositoConfirmado,
  desdeRetiroSolicitado,
  desdeUsuarioRegistrado,
} from './actividad.mapeo.js';
import { ActividadService, type ClienteActividad } from './actividad.service.js';

const d = (valor: string) => new Prisma.Decimal(valor);
const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };

describe('mapeo de eventos a actividad', () => {
  it('usuario.registrado → REGISTRO con IP y dispositivo, referenciado por el usuario', () => {
    expect(
      desdeUsuarioRegistrado({ usuarioId: 'u-1', ip: '203.0.113.1', dispositivo: 'disp-1' }),
    ).toEqual({
      usuarioId: 'u-1',
      tipo: 'REGISTRO',
      referenciaId: 'u-1',
      ip: '203.0.113.1',
      dispositivo: 'disp-1',
    });
  });

  it('deposito.confirmado → DEPOSITO con monto y huella del método de pago si llega', () => {
    const conHuella = desdeDepositoConfirmado({
      usuarioId: 'u-1',
      depositoId: 'dep-1',
      monto: '20.00',
      codigoCupon: null,
      metodoPagoHuella: 'a'.repeat(64),
    });
    const sinHuella = desdeDepositoConfirmado({
      usuarioId: 'u-1',
      depositoId: 'dep-2',
      monto: '5',
      codigoCupon: 'BIENVENIDA',
    });

    expect(conHuella).toEqual({
      usuarioId: 'u-1',
      tipo: 'DEPOSITO',
      referenciaId: 'dep-1',
      monto: d('20'),
      metodoPagoHuella: 'a'.repeat(64),
    });
    expect(sinHuella.metodoPagoHuella).toBeNull();
  });

  it('retiro.solicitado → RETIRO con monto', () => {
    expect(desdeRetiroSolicitado({ usuarioId: 'u-1', retiroId: 'ret-1', monto: '90' })).toEqual({
      usuarioId: 'u-1',
      tipo: 'RETIRO',
      referenciaId: 'ret-1',
      monto: d('90'),
    });
  });

  it('apuesta.aceptada → APUESTA_ACEPTADA con monto, tipo de saldo y cuota opcional', () => {
    const base = {
      usuarioId: 'u-1',
      apuestaId: 'ap-1',
      monto: '10.00',
      tipoSaldo: 'BONO' as const,
    };

    expect(desdeApuestaAceptada({ ...base, cuotaTotal: '2.10' })).toEqual({
      usuarioId: 'u-1',
      tipo: 'APUESTA_ACEPTADA',
      referenciaId: 'ap-1',
      monto: d('10'),
      tipoSaldo: 'BONO',
      cuota: d('2.10'),
    });
    expect(desdeApuestaAceptada(base).cuota).toBeNull();
    expect(desdeApuestaAceptada({ ...base, cuotaTotal: 'alta' }).cuota).toBeNull();
  });

  it('apuesta.liquidada → APUESTA_LIQUIDADA con monto y resultado', () => {
    expect(
      desdeApuestaLiquidada({
        usuarioId: 'u-1',
        apuestaId: 'ap-1',
        resultado: 'GANADA',
        monto: '10',
        premio: '21',
      }),
    ).toEqual({
      usuarioId: 'u-1',
      tipo: 'APUESTA_LIQUIDADA',
      referenciaId: 'ap-1',
      monto: d('10'),
      resultado: 'GANADA',
    });
  });

  it.each([
    () => desdeUsuarioRegistrado({ usuarioId: '', ip: '1.1.1.1', dispositivo: 'x' }),
    () =>
      desdeDepositoConfirmado({ usuarioId: 'u', depositoId: 'd', monto: '-1', codigoCupon: null }),
    () => desdeRetiroSolicitado({ usuarioId: 'u', retiroId: 'r', monto: 'mucho' }),
    () =>
      desdeApuestaLiquidada({
        usuarioId: 'u',
        apuestaId: 'a',
        resultado: 'EMPATE' as 'GANADA',
        monto: '1',
        premio: '0',
      }),
  ])('rechaza un evento mal formado (%#)', (mapear) => {
    expect(mapear).toThrow(EventoInvalidoError);
  });
});

describe('ActividadService', () => {
  function crearServicio(insertadas: number) {
    const prisma = {
      actividadUsuario: {
        createMany: vi.fn().mockResolvedValue({ count: insertadas }),
        findMany: vi.fn(),
      },
    };
    return { prisma, servicio: new ActividadService(prisma as unknown as PrismaService, reloj) };
  }

  it('inserta con la hora del servidor e ignora duplicados por (tipo, referencia)', async () => {
    const { prisma, servicio } = crearServicio(1);

    const creada = await servicio.registrar({
      usuarioId: 'u-1',
      tipo: 'RETIRO',
      referenciaId: 'r-1',
    });

    expect(creada).toBe(true);
    expect(prisma.actividadUsuario.createMany).toHaveBeenCalledWith({
      data: [{ usuarioId: 'u-1', tipo: 'RETIRO', referenciaId: 'r-1', ocurridoEn: AHORA }],
      skipDuplicates: true,
    });
  });

  it('devuelve false si el evento ya se había registrado (idempotencia)', async () => {
    const { servicio } = crearServicio(0);

    expect(
      await servicio.registrar({ usuarioId: 'u-1', tipo: 'RETIRO', referenciaId: 'r-1' }),
    ).toBe(false);
  });

  it('usa el cliente transaccional recibido', async () => {
    const { prisma, servicio } = crearServicio(1);
    const tx = { actividadUsuario: { createMany: vi.fn().mockResolvedValue({ count: 1 }) } };

    await servicio.registrar(
      { usuarioId: 'u-1', tipo: 'RETIRO', referenciaId: 'r-1' },
      tx as unknown as ClienteActividad,
    );

    expect(tx.actividadUsuario.createMany).toHaveBeenCalled();
    expect(prisma.actividadUsuario.createMany).not.toHaveBeenCalled();
  });

  it('encuentra las otras cuentas que comparten dispositivo o método de pago', async () => {
    const { prisma, servicio } = crearServicio(1);
    prisma.actividadUsuario.findMany
      .mockResolvedValueOnce([{ dispositivo: 'disp-1' }])
      .mockResolvedValueOnce([{ usuarioId: 'u-2' }])
      .mockResolvedValueOnce([{ usuarioId: 'u-3' }]);

    const relacionadas = await servicio.cuentasRelacionadas('u-1', { metodoPagoHuella: 'h-1' });

    expect(relacionadas).toEqual({
      dispositivos: ['disp-1'],
      porDispositivo: ['u-2'],
      porMetodoPago: ['u-3'],
    });
    expect(prisma.actividadUsuario.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { dispositivo: { in: ['disp-1'] }, usuarioId: { not: 'u-1' } },
      }),
    );
  });

  it('sin dispositivos ni método de pago no busca otras cuentas', async () => {
    const { prisma, servicio } = crearServicio(1);
    prisma.actividadUsuario.findMany.mockResolvedValueOnce([]);

    const relacionadas = await servicio.cuentasRelacionadas('u-1', {});

    expect(relacionadas).toEqual({ dispositivos: [], porDispositivo: [], porMetodoPago: [] });
    expect(prisma.actividadUsuario.findMany).toHaveBeenCalledTimes(1);
  });
});
