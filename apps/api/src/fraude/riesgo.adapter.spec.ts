import { CONFIG_FRAUDE, AHORA_FRAUDE } from '../../test/fabricas/fraude.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ActividadService } from './actividad.service.js';
import type { RegistroAlertasService } from './registro-alertas.service.js';
import { RiesgoAdapter } from './riesgo.adapter.js';

const d = (valor: string) => new Prisma.Decimal(valor);
const MONTO_RETIRO = d('50.00');
const DEPOSITO = {
  referenciaId: 'dep-1',
  monto: d('100.00'),
  ocurridoEn: new Date(AHORA_FRAUDE.getTime() - 2 * 3_600_000),
};

function crear(opciones: { deposito?: typeof DEPOSITO | null; apostado?: string | null } = {}) {
  const prisma = {
    actividadUsuario: {
      findFirst: vi
        .fn()
        .mockResolvedValue(opciones.deposito === undefined ? DEPOSITO : opciones.deposito),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { monto: opciones.apostado == null ? null : d(opciones.apostado) },
      }),
    },
  };
  const alertas = {
    registrar: vi.fn().mockResolvedValue(true),
    tieneAlertaAltaVigente: vi.fn().mockResolvedValue(false),
  };
  const adaptador = new RiesgoAdapter(
    prisma as unknown as PrismaService,
    {} as ActividadService,
    alertas as unknown as RegistroAlertasService,
    CONFIG_FRAUDE as never,
    { ahora: () => AHORA_FRAUDE },
  );
  return { prisma, alertas, adaptador };
}

describe('RiesgoAdapter.evaluarRetiro', () => {
  it('pide revisión y crea una alerta ALTA si apostó menos del porcentaje mínimo del depósito', async () => {
    const { adaptador, alertas, prisma } = crear({ apostado: '49.99' });

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado).toEqual({
      requiereRevision: true,
      motivos: ['retiro_tras_deposito_sin_actividad'],
    });
    const consulta = prisma.actividadUsuario.findFirst.mock.calls[0]?.[0] as {
      where: { ocurridoEn: { gte: Date } };
    };
    expect(consulta.where.ocurridoEn.gte).toEqual(
      new Date(AHORA_FRAUDE.getTime() - 24 * 3_600_000),
    );
    expect(alertas.registrar).toHaveBeenCalledWith({
      regla: 'RETIRO_TRAS_DEPOSITO',
      severidad: 'ALTA',
      usuarioId: 'u-1',
      evidencia: {
        depositoId: 'dep-1',
        deposito: '100.00',
        apostado: '49.99',
        minimoPorcentaje: 50,
        retiro: '50.00',
        ventanaHoras: 24,
      },
      claveDeduplicacion: 'retiro:u-1:dep-1',
    });
  });

  it('no pide revisión si apostó exactamente el porcentaje mínimo', async () => {
    const { adaptador, alertas } = crear({ apostado: '50.00' });

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado).toEqual({ requiereRevision: false, motivos: [] });
    expect(alertas.registrar).not.toHaveBeenCalled();
  });

  it('sin apuestas desde el depósito cuenta como 0 apostado', async () => {
    const { adaptador } = crear({ apostado: null });

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado.motivos).toEqual(['retiro_tras_deposito_sin_actividad']);
  });

  it('sin depósitos en la ventana no hay motivo por depósito', async () => {
    const { adaptador, prisma } = crear({ deposito: null });

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado).toEqual({ requiereRevision: false, motivos: [] });
    expect(prisma.actividadUsuario.aggregate).not.toHaveBeenCalled();
  });

  it('pide revisión si el usuario tiene una alerta ALTA abierta o confirmada', async () => {
    const { adaptador, alertas } = crear({ deposito: null });
    alertas.tieneAlertaAltaVigente.mockResolvedValue(true);

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado).toEqual({
      requiereRevision: true,
      motivos: ['usuario_con_alerta_de_fraude'],
    });
  });

  it('acumula los dos motivos cuando aplican ambos', async () => {
    const { adaptador, alertas } = crear({ apostado: '0' });
    alertas.tieneAlertaAltaVigente.mockResolvedValue(true);

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado.motivos).toEqual([
      'retiro_tras_deposito_sin_actividad',
      'usuario_con_alerta_de_fraude',
    ]);
  });

  it('falla cerrada ante cualquier error interno', async () => {
    const { adaptador, prisma } = crear();
    prisma.actividadUsuario.findFirst.mockRejectedValue(new Error('base caída'));

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado).toEqual({ requiereRevision: true, motivos: ['evaluacion_no_disponible'] });
  });

  it('falla cerrada si no se puede consultar las alertas del usuario', async () => {
    const { adaptador, alertas } = crear({ deposito: null });
    alertas.tieneAlertaAltaVigente.mockRejectedValue(new Error('timeout'));

    const resultado = await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    expect(resultado).toEqual({ requiereRevision: true, motivos: ['evaluacion_no_disponible'] });
  });

  it('repetir la evaluación no duplica la alerta (la clave de deduplicación es la misma)', async () => {
    const { adaptador, alertas } = crear({ apostado: '0' });

    await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);
    await adaptador.evaluarRetiro('u-1', MONTO_RETIRO);

    const claves = alertas.registrar.mock.calls.map(([alerta]) => alerta.claveDeduplicacion);
    expect(claves).toEqual(['retiro:u-1:dep-1', 'retiro:u-1:dep-1']);
  });
});
