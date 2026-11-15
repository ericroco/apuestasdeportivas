import { AHORA_FRAUDE, crearContextoFalso } from '../../../test/fabricas/fraude.js';
import {
  evaluarCuentasPorDispositivo,
  evaluarCuentasPorIp,
  evaluarMetodoPagoCompartido,
} from './cuentas-multiples.js';

const REGISTRO = {
  usuarioId: 'u-3',
  tipo: 'REGISTRO',
  referenciaId: 'u-3',
  ip: '203.0.113.9',
  dispositivo: 'disp-1',
} as const;
const DEPOSITO = {
  usuarioId: 'u-3',
  tipo: 'DEPOSITO',
  referenciaId: 'dep-1',
  metodoPagoHuella: 'a'.repeat(64),
} as const;

describe('evaluarCuentasPorDispositivo', () => {
  it('crea una alerta ALTA con las cuentas que comparten el dispositivo', async () => {
    const { contexto, actividad, alertas } = crearContextoFalso();
    actividad.cuentasRelacionadas.mockResolvedValue({
      dispositivos: ['disp-1'],
      porDispositivo: ['u-1', 'u-2'],
      porMetodoPago: [],
    });

    await evaluarCuentasPorDispositivo(contexto, REGISTRO);

    expect(alertas.registrar).toHaveBeenCalledWith({
      regla: 'CUENTAS_DISPOSITIVO',
      severidad: 'ALTA',
      usuarioId: 'u-3',
      evidencia: { dispositivo: 'disp-1', cuentas: ['u-3', 'u-1', 'u-2'] },
      claveDeduplicacion: 'dispositivo:u-3:disp-1',
    });
  });

  it('no alerta si nadie más usa el dispositivo o el evento no trae dispositivo', async () => {
    const { contexto, alertas } = crearContextoFalso();

    await evaluarCuentasPorDispositivo(contexto, REGISTRO);
    await evaluarCuentasPorDispositivo(contexto, { ...REGISTRO, dispositivo: null });

    expect(alertas.registrar).not.toHaveBeenCalled();
  });
});

describe('evaluarCuentasPorIp', () => {
  const registros = (cantidad: number) =>
    Array.from({ length: cantidad }, (_, i) => ({ usuarioId: `u-${i + 1}` }));

  it('no alerta cuando la IP llega justo al umbral', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.findMany.mockResolvedValue(registros(3));

    await evaluarCuentasPorIp(contexto, REGISTRO);

    expect(alertas.registrar).not.toHaveBeenCalled();
  });

  it('alerta MEDIA cuando la IP supera el umbral dentro de la ventana', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso();
    prisma.actividadUsuario.findMany.mockResolvedValue(registros(4));

    await evaluarCuentasPorIp(contexto, REGISTRO);

    const consulta = prisma.actividadUsuario.findMany.mock.calls[0]?.[0] as {
      where: { ocurridoEn: { gte: Date }; ip: string; tipo: string };
    };
    expect(consulta.where.ip).toBe('203.0.113.9');
    expect(consulta.where.tipo).toBe('REGISTRO');
    expect(consulta.where.ocurridoEn.gte).toEqual(
      new Date(AHORA_FRAUDE.getTime() - 24 * 3_600_000),
    );
    expect(alertas.registrar).toHaveBeenCalledWith({
      regla: 'CUENTAS_IP',
      severidad: 'MEDIA',
      usuarioId: 'u-3',
      evidencia: {
        ip: '203.0.113.9',
        cuentas: ['u-1', 'u-2', 'u-3', 'u-4'],
        umbral: 3,
        ventanaHoras: 24,
      },
      claveDeduplicacion: 'ip:u-3:203.0.113.9',
    });
  });

  it('respeta el umbral configurado y no consulta sin IP', async () => {
    const { contexto, prisma, alertas } = crearContextoFalso({ FRAUDE_IP_MAX_CUENTAS: 1 });
    await evaluarCuentasPorIp(contexto, { ...REGISTRO, ip: null });
    expect(prisma.actividadUsuario.findMany).not.toHaveBeenCalled();

    prisma.actividadUsuario.findMany.mockResolvedValue(registros(2));
    await evaluarCuentasPorIp(contexto, REGISTRO);
    expect(alertas.registrar).toHaveBeenCalledOnce();
  });
});

describe('evaluarMetodoPagoCompartido', () => {
  it('crea una alerta ALTA cuando otra cuenta depositó con el mismo método', async () => {
    const { contexto, actividad, alertas } = crearContextoFalso();
    actividad.cuentasRelacionadas.mockResolvedValue({
      dispositivos: [],
      porDispositivo: [],
      porMetodoPago: ['u-1'],
    });

    await evaluarMetodoPagoCompartido(contexto, DEPOSITO);

    expect(actividad.cuentasRelacionadas).toHaveBeenCalledWith('u-3', {
      metodoPagoHuella: 'a'.repeat(64),
    });
    expect(alertas.registrar).toHaveBeenCalledWith({
      regla: 'METODO_PAGO_COMPARTIDO',
      severidad: 'ALTA',
      usuarioId: 'u-3',
      evidencia: { metodoPago: 'a'.repeat(12), cuentas: ['u-3', 'u-1'], depositoId: 'dep-1' },
      claveDeduplicacion: `metodo:u-3:${'a'.repeat(64)}`,
    });
  });

  it('no evalúa si el depósito no trae huella del método de pago', async () => {
    const { contexto, actividad, alertas } = crearContextoFalso();

    await evaluarMetodoPagoCompartido(contexto, { ...DEPOSITO, metodoPagoHuella: null });

    expect(actividad.cuentasRelacionadas).not.toHaveBeenCalled();
    expect(alertas.registrar).not.toHaveBeenCalled();
  });

  it('no alerta si nadie más usa el método', async () => {
    const { contexto, alertas } = crearContextoFalso();

    await evaluarMetodoPagoCompartido(contexto, DEPOSITO);

    expect(alertas.registrar).not.toHaveBeenCalled();
  });
});
