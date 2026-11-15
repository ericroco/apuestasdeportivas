import request from 'supertest';
import {
  CuponInvalidoError,
  PROMOCIONES_APUESTA_PORT,
  type EfectoPromocion,
  type PromocionesApuestaPort,
} from '../src/contracts/promociones.port.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { comoUsuario } from './dobles/guard-de-prueba.js';
import {
  crearAppDePrueba,
  limpiarTablasSpec4,
  type AppDePrueba,
} from './utilidades/app-de-prueba.js';

// HU2: el contrato 4 dentro de la transacción de la apuesta, contra PostgreSQL real.
const d = (valor: string) => new Prisma.Decimal(valor);
const VIGENCIA = {
  iniciaEn: new Date('2026-01-01T00:00:00Z'),
  terminaEn: new Date('2099-01-01T00:00:00Z'),
};
/** Las 50 transacciones esperan su turno en el pool y en el bloqueo del cupón. */
const OPCIONES_TX = { maxWait: 60_000, timeout: 60_000 };

class ApuestaFallida extends Error {}

describe('PromocionesApuestaPort (e2e)', () => {
  let contexto: AppDePrueba;
  let puerto: PromocionesApuestaPort;

  beforeAll(async () => {
    contexto = await crearAppDePrueba();
    puerto = contexto.app.get<PromocionesApuestaPort>(PROMOCIONES_APUESTA_PORT);
  });

  beforeEach(async () => {
    await limpiarTablasSpec4(contexto.prisma);
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  function crearCupon(datos: Partial<Prisma.CuponCreateInput> = {}) {
    return contexto.prisma.cupon.create({
      data: {
        codigo: 'CUOTA10',
        tipo: 'AUMENTO_CUOTA',
        porcentaje: d('10'),
        apuestaMaxima: d('100'),
        cupoTotal: 10,
        creadoPor: 'operador-1',
        ...VIGENCIA,
        ...datos,
      },
    });
  }

  function aplicar(
    usuarioId: string,
    codigoCupon: string,
    monto = '5.00',
  ): Promise<EfectoPromocion> {
    return contexto.prisma.$transaction(
      (tx) =>
        puerto.aplicarAApuesta(tx, {
          usuarioId,
          codigoCupon,
          monto: d(monto),
          cuotaTotal: d('2.00'),
        }),
      OPCIONES_TX,
    );
  }

  it('50 canjes simultáneos de usuarios distintos con cupo 10 aceptan exactamente 10', async () => {
    const cupon = await crearCupon({ cupoTotal: 10 });

    const resultados = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) => aplicar(`usuario-${i}`, 'CUOTA10')),
    );

    const aceptados = resultados.filter((r) => r.status === 'fulfilled');
    const rechazados = resultados.filter((r) => r.status === 'rejected');
    expect(aceptados).toHaveLength(10);
    expect(rechazados).toHaveLength(40);
    for (const rechazo of rechazados) {
      expect(rechazo.reason).toBeInstanceOf(CuponInvalidoError);
      expect((rechazo.reason as Error).message).toBe('El cupón se agotó.');
    }
    const final = await contexto.prisma.cupon.findUniqueOrThrow({ where: { id: cupon.id } });
    expect(final.canjes).toBe(10);
    expect(await contexto.prisma.canjeCupon.count({ where: { cuponId: cupon.id } })).toBe(10);
  });

  it('el mismo usuario con 5 canjes simultáneos solo consume su límite', async () => {
    await crearCupon({ cupoTotal: 50, limitePorUsuario: 2 });

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () => aplicar('usuario-1', 'CUOTA10')),
    );

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await contexto.prisma.canjeCupon.count()).toBe(2);
  });

  it('un aumento del 10 % congela 2.20 y un segundo uso responde "Ya usaste este cupón."', async () => {
    await crearCupon();

    const efecto = await aplicar('usuario-1', 'cuota10');

    expect(efecto.cuotaFinal.toFixed(2)).toBe('2.20');
    await expect(aplicar('usuario-1', 'CUOTA10')).rejects.toThrow('Ya usaste este cupón.');
  });

  it('si la apuesta se revierte después de aplicar la apuesta gratis, no queda canje ni bono', async () => {
    const cupon = await crearCupon({
      codigo: 'GRATIS5',
      tipo: 'APUESTA_GRATIS',
      porcentaje: null,
      apuestaMaxima: null,
      montoFijo: d('5'),
    });

    await expect(
      contexto.prisma.$transaction(async (tx) => {
        const efecto = await puerto.aplicarAApuesta(tx, {
          usuarioId: 'usuario-1',
          codigoCupon: 'GRATIS5',
          monto: d('5'),
          cuotaTotal: d('2.00'),
        });
        expect(efecto.tipoSaldo).toBe('BONO');
        throw new ApuestaFallida('saldo insuficiente al debitar');
      }),
    ).rejects.toThrow(ApuestaFallida);

    expect(await contexto.prisma.canjeCupon.count()).toBe(0);
    expect(await contexto.prisma.bono.count()).toBe(0);
    const final = await contexto.prisma.cupon.findUniqueOrThrow({ where: { id: cupon.id } });
    expect(final.canjes).toBe(0);
  });

  it('una apuesta gratis válida crea el bono activo con su requisito de rollover', async () => {
    await crearCupon({
      codigo: 'GRATIS5',
      tipo: 'APUESTA_GRATIS',
      porcentaje: null,
      apuestaMaxima: null,
      montoFijo: d('5'),
    });

    // Usuario propio: la billetera en memoria no se revierte con las transacciones de otras pruebas.
    const efecto = await aplicar('usuario-gratis', 'GRATIS5', '5.00');

    expect(efecto.tipoSaldo).toBe('BONO');
    const bono = await contexto.prisma.bono.findFirstOrThrow({
      where: { usuarioId: 'usuario-gratis' },
    });
    expect(bono).toMatchObject({ estado: 'ACTIVO' });
    expect(bono.requisito.toFixed(2)).toBe('25.00');
    const saldos = await contexto.billetera?.obtenerSaldos('usuario-gratis');
    expect(saldos?.bono.toFixed(2)).toBe('5.00');
  });

  it('dos apuestas gratis simultáneas del mismo usuario dejan un solo bono activo', async () => {
    const gratis = { tipo: 'APUESTA_GRATIS' as const, porcentaje: null, apuestaMaxima: null };
    await crearCupon({ ...gratis, codigo: 'GRATISA', montoFijo: d('5') });
    await crearCupon({ ...gratis, codigo: 'GRATISB', montoFijo: d('5') });

    const resultados = await Promise.allSettled([
      aplicar('usuario-simultaneo', 'GRATISA'),
      aplicar('usuario-simultaneo', 'GRATISB'),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected');
    expect((rechazo as PromiseRejectedResult).reason.message).toMatch(/Ya tienes un bono activo/);
    expect(await contexto.prisma.bono.count({ where: { estado: 'ACTIVO' } })).toBe(1);
  });

  it('rechaza el cupón que ya usó otra cuenta del mismo dispositivo y registra la alerta', async () => {
    const cupon = await crearCupon();
    for (const usuarioId of ['usuario-1', 'usuario-2']) {
      await contexto.emitir('usuario.registrado', {
        usuarioId,
        ip: '203.0.113.5',
        dispositivo: 'disp-x',
      });
    }
    await aplicar('usuario-2', 'CUOTA10');

    await expect(aplicar('usuario-1', 'CUOTA10')).rejects.toThrow(
      'Este cupón ya se usó desde tu dispositivo o método de pago.',
    );

    await vi.waitFor(async () => {
      const alerta = await contexto.prisma.alertaFraude.findUniqueOrThrow({
        where: { claveDeduplicacion: `cupon:usuario-1:${cupon.id}` },
      });
      expect(alerta).toMatchObject({ regla: 'CUPON_CUENTA_MULTIPLE', severidad: 'ALTA' });
    });
  });

  it('rechaza cupones vencidos y pausados sin consumirlos', async () => {
    await crearCupon({ codigo: 'VENCIDO1', terminaEn: new Date('2026-02-01T00:00:00Z') });
    await crearCupon({ codigo: 'PAUSADO1', estado: 'PAUSADO' });

    await expect(aplicar('usuario-1', 'VENCIDO1')).rejects.toThrow('El cupón venció.');
    await expect(aplicar('usuario-1', 'PAUSADO1')).rejects.toThrow('El cupón está pausado.');
    expect(await contexto.prisma.canjeCupon.count()).toBe(0);
  });
});

describe('GET /api/cupones/vista-previa/:codigo (e2e)', () => {
  let contexto: AppDePrueba;
  const APOSTADOR = comoUsuario('apostador-vp', 'APOSTADOR');
  const http = () => request(contexto.app.getHttpServer());

  beforeAll(async () => {
    contexto = await crearAppDePrueba();
    await limpiarTablasSpec4(contexto.prisma);
    await contexto.prisma.cupon.createMany({
      data: [
        {
          codigo: 'BIENVENIDA10',
          tipo: 'BONO_DEPOSITO',
          porcentaje: d('100'),
          topeBono: d('10'),
          depositoMinimo: d('10'),
          cupoTotal: 5,
          creadoPor: 'operador-1',
          ...VIGENCIA,
        },
        {
          codigo: 'PAUSADO1',
          tipo: 'APUESTA_GRATIS',
          montoFijo: d('5'),
          cupoTotal: 5,
          estado: 'PAUSADO',
          creadoPor: 'operador-1',
          ...VIGENCIA,
        },
      ],
    });
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  it('describe el cupón y dice si se puede usar, sin consumirlo', async () => {
    const respuesta = await http()
      .get('/api/cupones/vista-previa/bienvenida10')
      .set(APOSTADOR)
      .expect(200);

    expect(respuesta.body).toEqual({
      codigo: 'BIENVENIDA10',
      tipo: 'BONO_DEPOSITO',
      descripcion: 'Bono del 100 % de tu depósito, hasta 10.00. Depósito mínimo 10.00.',
      terminaEn: '2099-01-01T00:00:00.000Z',
      puedeUsar: true,
      motivo: null,
    });
    const cupon = await contexto.prisma.cupon.findUniqueOrThrow({
      where: { codigo: 'BIENVENIDA10' },
    });
    expect(cupon.canjes).toBe(0);
    expect(await contexto.prisma.canjeCupon.count()).toBe(0);
  });

  it('explica por qué no se puede usar un cupón pausado', async () => {
    const respuesta = await http()
      .get('/api/cupones/vista-previa/PAUSADO1')
      .set(APOSTADOR)
      .expect(200);

    expect(respuesta.body).toMatchObject({
      puedeUsar: false,
      motivo: { codigo: 'CUPON_PAUSADO', mensaje: 'El cupón está pausado.' },
    });
  });

  it('un código inexistente responde 200 sin revelar más', async () => {
    const respuesta = await http()
      .get('/api/cupones/vista-previa/NOEXISTE')
      .set(APOSTADOR)
      .expect(200);

    expect(respuesta.body).toEqual({
      codigo: 'NOEXISTE',
      tipo: null,
      descripcion: null,
      terminaEn: null,
      puedeUsar: false,
      motivo: { codigo: 'CUPON_INEXISTENTE', mensaje: 'El cupón no existe.' },
    });
  });

  it('exige sesión de apostador', async () => {
    await http().get('/api/cupones/vista-previa/BIENVENIDA10').expect(401);
    await http()
      .get('/api/cupones/vista-previa/BIENVENIDA10')
      .set(comoUsuario('operador-1', 'OPERADOR'))
      .expect(403);
  });

  it('limita a 10 consultas por minuto por usuario (enumeración de códigos)', async () => {
    const otro = comoUsuario('apostador-limite', 'APOSTADOR');
    for (let i = 0; i < 10; i += 1) {
      await http().get(`/api/cupones/vista-previa/CODIGO${i}`).set(otro).expect(200);
    }

    await http().get('/api/cupones/vista-previa/CODIGO11').set(otro).expect(429);
    await http()
      .get('/api/cupones/vista-previa/CODIGO11')
      .set(comoUsuario('apostador-distinto', 'APOSTADOR'))
      .expect(200);
  });
});
