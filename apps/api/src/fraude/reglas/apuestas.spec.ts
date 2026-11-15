import { AHORA_FRAUDE, crearContextoFalso } from '../../../test/fabricas/fraude.js';
import { Prisma } from '../../generated/prisma/client.js';
import { evaluarMontoAnomalo, evaluarRafaga } from './apuestas.js';

const d = (valor: string) => new Prisma.Decimal(valor);
const APUESTA = {
  usuarioId: 'u-1',
  tipo: 'APUESTA_ACEPTADA',
  referenciaId: 'ap-9',
  monto: d('150.00'),
  tipoSaldo: 'REAL',
} as const;

describe('evaluarMontoAnomalo', () => {
  it('alerta MEDIA cuando el monto supera el promedio por el factor', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.aggregate.mockResolvedValue({
      _avg: { monto: d('10.00') },
      _count: { _all: 5 },
    });

    await evaluarMontoAnomalo(contexto, APUESTA);

    expect(prisma.actividadUsuario.aggregate.mock.calls[0]?.[0]).toMatchObject({
      where: { usuarioId: 'u-1', tipo: 'APUESTA_ACEPTADA', referenciaId: { not: 'ap-9' } },
    });
    expect(alertas.registrar).toHaveBeenCalledWith({
      regla: 'APUESTA_MONTO_ANOMALO',
      severidad: 'MEDIA',
      usuarioId: 'u-1',
      evidencia: {
        apuestaId: 'ap-9',
        monto: '150.00',
        promedioPrevio: '10.00',
        factor: 10,
        apuestasPrevias: 5,
      },
      claveDeduplicacion: 'monto:ap-9',
    });
  });

  it('no alerta si el monto es exactamente el promedio por el factor', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.aggregate.mockResolvedValue({
      _avg: { monto: d('15.00') },
      _count: { _all: 5 },
    });

    await evaluarMontoAnomalo(contexto, APUESTA);

    expect(alertas.registrar).not.toHaveBeenCalled();
  });

  it('no alerta con menos apuestas previas que el historial mínimo', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.aggregate.mockResolvedValue({
      _avg: { monto: d('1.00') },
      _count: { _all: 4 },
    });

    await evaluarMontoAnomalo(contexto, APUESTA);

    expect(alertas.registrar).not.toHaveBeenCalled();
  });

  it('ignora eventos sin monto', async () => {
    const { contexto, prisma } = crearContextoFalso();

    await evaluarMontoAnomalo(contexto, { ...APUESTA, monto: null });

    expect(prisma.actividadUsuario.aggregate).not.toHaveBeenCalled();
  });
});

describe('evaluarRafaga', () => {
  it('alerta MEDIA cuando las apuestas de la ventana superan el máximo', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.count.mockResolvedValue(11);

    await evaluarRafaga(contexto, APUESTA);

    const consulta = prisma.actividadUsuario.count.mock.calls[0]?.[0] as {
      where: { ocurridoEn: { gte: Date } };
    };
    expect(consulta.where.ocurridoEn.gte).toEqual(new Date(AHORA_FRAUDE.getTime() - 60_000));
    const ventana = Math.floor(AHORA_FRAUDE.getTime() / 1000 / 60);
    expect(alertas.registrar).toHaveBeenCalledWith({
      regla: 'RAFAGA_APUESTAS',
      severidad: 'MEDIA',
      usuarioId: 'u-1',
      evidencia: { apuestas: 11, maximo: 10, ventanaSegundos: 60, ultimaApuestaId: 'ap-9' },
      claveDeduplicacion: `rafaga:u-1:${ventana}`,
    });
  });

  it('no alerta con exactamente el máximo', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.count.mockResolvedValue(10);

    await evaluarRafaga(contexto, APUESTA);

    expect(alertas.registrar).not.toHaveBeenCalled();
  });

  it('usa la misma clave para todas las apuestas de una misma ventana', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.count.mockResolvedValue(12);

    await evaluarRafaga(contexto, APUESTA);
    await evaluarRafaga(contexto, { ...APUESTA, referenciaId: 'ap-10' });

    const claves = alertas.registrar.mock.calls.map(([alerta]) => alerta.claveDeduplicacion);
    expect(new Set(claves).size).toBe(1);
  });
});
