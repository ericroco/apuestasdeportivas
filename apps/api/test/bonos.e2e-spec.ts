import request from 'supertest';
import type { ApuestaLiquidada } from '../src/contracts/eventos.js';
import type { ApuestaAceptadaExtendida } from '../src/fraude/eventos-extendidos.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { comoUsuario } from './dobles/guard-de-prueba.js';
import {
  crearAppDePrueba,
  limpiarTablasSpec4,
  type AppDePrueba,
} from './utilidades/app-de-prueba.js';

// HU3: bono de depósito y rollover desde los eventos de dominio, contra PostgreSQL real.
const d = (valor: string) => new Prisma.Decimal(valor);
const USUARIO = 'apostador-bonos';
const MIOS = comoUsuario(USUARIO, 'APOSTADOR');

describe('Bono de depósito y rollover (e2e)', () => {
  let contexto: AppDePrueba;
  const http = () => request(contexto.app.getHttpServer());

  beforeAll(async () => {
    contexto = await crearAppDePrueba();
  });

  beforeEach(async () => {
    await limpiarTablasSpec4(contexto.prisma);
    contexto.billetera?.reiniciar();
    contexto.auditoria?.reiniciar();
    await contexto.prisma.cupon.create({
      data: {
        codigo: 'BIENVENIDA10',
        tipo: 'BONO_DEPOSITO',
        porcentaje: d('100'),
        topeBono: d('10'),
        depositoMinimo: d('10'),
        cupoTotal: 100,
        creadoPor: 'operador-1',
        iniciaEn: new Date('2026-01-01T00:00:00Z'),
        terminaEn: new Date('2099-01-01T00:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  const depositar = (
    depositoId: string,
    monto: string,
    codigoCupon: string | null = 'BIENVENIDA10',
  ) =>
    contexto.emitir('deposito.confirmado', { usuarioId: USUARIO, depositoId, monto, codigoCupon });

  const aceptar = (apuestaId: string, monto: string, cuotaTotal?: string) =>
    contexto.emitir('apuesta.aceptada', {
      usuarioId: USUARIO,
      apuestaId,
      monto,
      tipoSaldo: 'REAL',
      ...(cuotaTotal && { cuotaTotal }),
    } as ApuestaAceptadaExtendida);

  const liquidar = (apuestaId: string, monto: string, resultado: ApuestaLiquidada['resultado']) =>
    contexto.emitir('apuesta.liquidada', {
      usuarioId: USUARIO,
      apuestaId,
      monto,
      resultado,
      premio: resultado === 'GANADA' ? monto : '0.00',
    });

  const asientos = (operacion: string) =>
    contexto.billetera?.asientos.filter(
      (a) => a.usuarioId === USUARIO && a.operacion === operacion,
    ) ?? [];

  it('el mismo depósito confirmado 5 veces otorga un solo bono de 10.00 con requisito 50.00', async () => {
    await Promise.all(Array.from({ length: 5 }, () => depositar('dep-1', '20.00')));

    const bonos = await contexto.prisma.bono.findMany({ where: { usuarioId: USUARIO } });
    expect(bonos).toHaveLength(1);
    expect(bonos[0]?.monto.toFixed(2)).toBe('10.00');
    expect(bonos[0]?.requisito.toFixed(2)).toBe('50.00');
    expect(asientos('BONO')).toHaveLength(1);
    expect(await contexto.prisma.canjeCupon.count()).toBe(1);
    expect(contexto.auditoria?.acciones().filter((a) => a === 'bono.otorgado')).toHaveLength(1);
  });

  it('un depósito por debajo del mínimo no otorga bono y el motivo se ve en "Mis bonos"', async () => {
    await depositar('dep-chico', '5.00');

    const respuesta = await http().get('/api/bonos/mios').set(MIOS).expect(200);

    expect(respuesta.body).toMatchObject({
      activo: null,
      historial: [],
      cuotaMinima: '1.50',
      canjesRechazados: [
        {
          codigo: 'BIENVENIDA10',
          motivo: {
            codigo: 'DEPOSITO_INSUFICIENTE',
            mensaje: 'El depósito no alcanza el mínimo del cupón.',
          },
        },
      ],
    });
    expect(asientos('BONO')).toHaveLength(0);
  });

  it('solo cuentan las apuestas aceptadas tras el bono, ganadas o perdidas y con cuota mínima', async () => {
    await aceptar('ap-antes', '40.00', '2.00');
    await contexto.prisma.actividadUsuario.updateMany({
      where: { referenciaId: 'ap-antes' },
      data: { ocurridoEn: new Date('2026-01-02T00:00:00Z') },
    });
    await depositar('dep-1', '20.00');
    await aceptar('ap-cuota-baja', '30.00', '1.20');
    await aceptar('ap-sin-cuota', '30.00');
    await aceptar('ap-anulada', '30.00', '3.00');
    await aceptar('ap-valida', '20.00', '1.50');
    for (const [apuestaId, monto, resultado] of [
      ['ap-antes', '40.00', 'PERDIDA'],
      ['ap-cuota-baja', '30.00', 'PERDIDA'],
      ['ap-sin-cuota', '30.00', 'GANADA'],
      ['ap-anulada', '30.00', 'ANULADA'],
      ['ap-valida', '20.00', 'GANADA'],
      ['ap-sin-aceptacion', '30.00', 'PERDIDA'],
    ] as const) {
      await liquidar(apuestaId, monto, resultado);
    }

    const respuesta = await http().get('/api/bonos/mios').set(MIOS).expect(200);

    expect(respuesta.body.activo).toMatchObject({
      monto: '10.00',
      requisito: '50.00',
      avance: '20.00',
      porcentajeAvance: 40,
      estado: 'ACTIVO',
      codigoCupon: 'BIENVENIDA10',
    });
    expect(asientos('CONVERSION')).toHaveLength(0);
  });

  it('al cumplir el requisito convierte todo el saldo de bono una sola vez, aunque los eventos se repitan', async () => {
    await depositar('dep-1', '20.00');
    await aceptar('ap-1', '30.00', '2.00');
    await aceptar('ap-2', '20.00', '1.80');
    await liquidar('ap-1', '30.00', 'PERDIDA');
    // Re-liquidación de una apuesta ya contada: no suma dos veces.
    await liquidar('ap-1', '30.00', 'GANADA');
    const parcial = await contexto.prisma.bono.findFirstOrThrow({ where: { usuarioId: USUARIO } });
    expect(parcial.avance.toFixed(2)).toBe('30.00');

    await Promise.all(Array.from({ length: 5 }, () => liquidar('ap-2', '20.00', 'GANADA')));

    const bono = await contexto.prisma.bono.findFirstOrThrow({ where: { usuarioId: USUARIO } });
    expect(bono.estado).toBe('CUMPLIDO');
    expect(bono.montoConvertido?.toFixed(2)).toBe('10.00');
    expect(asientos('CONVERSION')).toHaveLength(1);
    const saldos = await contexto.billetera?.obtenerSaldos(USUARIO);
    expect(saldos?.bono.toFixed(2)).toBe('0.00');
    expect(saldos?.real.toFixed(2)).toBe('10.00');
    expect(contexto.auditoria?.acciones().filter((a) => a === 'bono.convertido')).toHaveLength(1);

    const mios = await http().get('/api/bonos/mios').set(MIOS).expect(200);
    expect(mios.body.activo).toBeNull();
    expect(mios.body.historial[0]).toMatchObject({ estado: 'CUMPLIDO', montoConvertido: '10.00' });
  });

  it('reutilizar el mismo cupón en otro depósito se rechaza (LIMITE_USUARIO)', async () => {
    await depositar('dep-1', '20.00');
    await depositar('dep-2', '20.00');

    const rechazado = await contexto.prisma.canjeCupon.findUniqueOrThrow({
      where: { origen_referenciaId: { origen: 'DEPOSITO', referenciaId: 'dep-2' } },
    });
    expect(rechazado).toMatchObject({ estado: 'RECHAZADO', motivo: 'LIMITE_USUARIO' });
  });

  it('con un bono activo otro cupón de bono se rechaza; vencido, no se convierte y permite otro', async () => {
    await contexto.prisma.cupon.create({
      data: {
        codigo: 'RECARGA',
        tipo: 'BONO_DEPOSITO',
        porcentaje: d('50'),
        topeBono: d('20'),
        depositoMinimo: d('0'),
        cupoTotal: 100,
        creadoPor: 'operador-1',
        iniciaEn: new Date('2026-01-01T00:00:00Z'),
        terminaEn: new Date('2099-01-01T00:00:00Z'),
      },
    });
    await depositar('dep-1', '20.00');
    await depositar('dep-2', '20.00', 'RECARGA');
    expect(
      await contexto.prisma.canjeCupon.findFirst({ where: { referenciaId: 'dep-2' } }),
    ).toMatchObject({ motivo: 'BONO_ACTIVO' });
    await contexto.prisma.bono.updateMany({
      where: { usuarioId: USUARIO },
      data: { venceEn: new Date('2026-01-03T00:00:00Z') },
    });

    const mios = await http().get('/api/bonos/mios').set(MIOS).expect(200);
    await depositar('dep-3', '20.00', 'RECARGA');

    expect(mios.body.activo).toBeNull();
    expect(mios.body.historial[0]).toMatchObject({ estado: 'VENCIDO', montoConvertido: null });
    const activos = await contexto.prisma.bono.findMany({
      where: { usuarioId: USUARIO, estado: 'ACTIVO' },
    });
    expect(activos).toHaveLength(1);
    expect(activos[0]?.monto.toFixed(2)).toBe('10.00');
    expect(asientos('CONVERSION')).toHaveLength(0);
  });

  it('"Mis bonos" exige sesión de apostador', async () => {
    await http().get('/api/bonos/mios').expect(401);
    await http().get('/api/bonos/mios').set(comoUsuario('admin-1', 'ADMINISTRADOR')).expect(403);
  });
});
