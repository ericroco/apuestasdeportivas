import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados, crearUsuarioConSaldo } from './utilidades/fabricas.js';

// HU2 (T041): doble gasto con apuestas simultáneas (SC-004) y apuesta duplicada por reenvío (FR-020).
describe('HU2: concurrencia e idempotencia de la solicitud (e2e)', () => {
  const entornoOriginal = { ...process.env };
  let ctx: AppPrueba;

  beforeAll(async () => {
    // El límite global por IP no es lo que se prueba aquí: todas las peticiones salen de la misma IP.
    process.env.THROTTLE_LIMIT = '1000';
    ctx = await crearAppPrueba();
  });

  afterAll(async () => {
    await ctx.app.close();
    process.env = entornoOriginal;
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  async function preparar(saldo: string) {
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, saldo);
    const partido = await crearPartidoConMercados(ctx.prisma);
    const local = partido.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;
    const apostar = (claveSolicitud: string, monto: string) =>
      request(ctx.app.getHttpServer())
        .post('/api/apuestas')
        .set(comoUsuario(usuarioId))
        .send({
          claveSolicitud,
          monto,
          selecciones: [{ seleccionId: local.id, cuotaVista: '2.10' }],
        });
    return { usuarioId, apostar };
  }

  it('20 apuestas simultáneas que superan el saldo: el monto aceptado nunca lo supera', async () => {
    const { usuarioId, apostar } = await preparar('100.00');

    const respuestas = await Promise.all(
      Array.from({ length: 20 }, () => apostar(randomUUID(), '15.00')),
    );

    const aceptadas = respuestas.filter((r) => r.status === 201);
    const rechazadas = respuestas.filter((r) => r.status === 422);
    expect(aceptadas).toHaveLength(6);
    expect(rechazadas).toHaveLength(14);
    expect(rechazadas.every((r) => r.body.codigo === 'SALDO_INSUFICIENTE')).toBe(true);
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('10.00');
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(6);
    expect(await ctx.billetera.contarAsientos(usuarioId, 'DEBITO_APUESTA')).toBe(6);
  });

  it('dos envíos con la misma claveSolicitud dejan una sola apuesta y un solo descuento', async () => {
    const { usuarioId, apostar } = await preparar('100.00');
    const clave = randomUUID();

    const [primera, segunda] = await Promise.all([
      apostar(clave, '10.00'),
      apostar(clave, '10.00'),
    ]);

    expect([primera.status, segunda.status].sort((a, b) => a - b)).toEqual([200, 201]);
    expect(primera.body.id).toBe(segunda.body.id);
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(1);
    expect(await ctx.billetera.contarAsientos(usuarioId, 'DEBITO_APUESTA')).toBe(1);
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('90.00');
  });

  it('el límite diario se respeta aunque las apuestas lleguen a la vez', async () => {
    const { usuarioId, apostar } = await preparar('5000.00');

    const respuestas = await Promise.all(
      Array.from({ length: 4 }, () => apostar(randomUUID(), '400.00')),
    );

    // 1000.00 por día: caben 2 de 400 (800); la tercera superaría el límite.
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(2);
    expect(
      respuestas.filter((r) => r.status === 422).every((r) => r.body.limite === 'DIARIO'),
    ).toBe(true);
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('4200.00');
  });
});
