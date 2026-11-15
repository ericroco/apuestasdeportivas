import { randomUUID } from 'node:crypto';
import type { ApuestaDto } from '@apuestas/shared';
import request from 'supertest';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import {
  crearCompeticion,
  crearPartidoConMercados,
  crearUsuarioConSaldo,
} from './utilidades/fabricas.js';

// HU4 (T051): combinadas de partidos distintos con la cuota total congelada (FR-014, FR-016).
describe('HU4: apuestas combinadas (e2e)', () => {
  let ctx: AppPrueba;

  beforeAll(async () => {
    ctx = await crearAppPrueba();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  /** Tres partidos con su 1X2; devuelve la selección LOCAL (2.10) de cada uno. */
  async function tresLocales() {
    const competicion = await crearCompeticion(ctx.prisma);
    const partidos = await Promise.all(
      [0, 1, 2].map(() => crearPartidoConMercados(ctx.prisma, { competicionId: competicion.id })),
    );
    return partidos.map((p) => p.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!);
  }

  const apostar = (usuarioId: string, selecciones: Array<{ id: string; cuota: string }>) =>
    request(ctx.app.getHttpServer())
      .post('/api/apuestas')
      .set(comoUsuario(usuarioId))
      .send({
        claveSolicitud: randomUUID(),
        monto: '10.00',
        selecciones: selecciones.map((s) => ({ seleccionId: s.id, cuotaVista: s.cuota })),
      });

  it('acepta una combinada de 3 con la cuota total congelada y un solo descuento', async () => {
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const locales = await tresLocales();

    const respuesta = await apostar(
      usuarioId,
      locales.map((s) => ({ id: s.id, cuota: '2.10' })),
    ).expect(201);
    const apuesta = respuesta.body as ApuestaDto;

    // 2.10 × 2.10 × 2.10 = 9.261 → 9.26; ganancia 10.00 × 9.26 = 92.60.
    expect(apuesta).toMatchObject({
      tipo: 'COMBINADA',
      cuotaTotal: '9.26',
      gananciaPotencial: '92.60',
    });
    expect(apuesta.selecciones).toHaveLength(3);
    expect(apuesta.selecciones.every((s) => s.cuotaCongelada === '2.10')).toBe(true);
    expect(await ctx.billetera.contarAsientos(usuarioId, 'DEBITO_APUESTA')).toBe(1);
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('90.00');
  });

  it('rechaza dos selecciones del mismo partido con COMBINADA_INVALIDA y sin efectos', async () => {
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const partido = await crearPartidoConMercados(ctx.prisma, {
      mercados: [{}, { tipo: 'AMBOS_MARCAN', cuotas: { SI: '1.80', NO: '1.95' } }],
    });
    const local = partido.mercados
      .find((m) => m.tipo === 'RESULTADO_FINAL')!
      .selecciones.find((s) => s.codigo === 'LOCAL')!;
    const ambos = partido.mercados
      .find((m) => m.tipo === 'AMBOS_MARCAN')!
      .selecciones.find((s) => s.codigo === 'SI')!;

    const respuesta = await apostar(usuarioId, [
      { id: local.id, cuota: '2.10' },
      { id: ambos.id, cuota: '1.80' },
    ]).expect(422);

    expect(respuesta.body).toMatchObject({ codigo: 'COMBINADA_INVALIDA' });
    expect(respuesta.body.message).toMatch(/mismo partido/);
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(0);
    expect(await ctx.billetera.contarAsientos(usuarioId, 'DEBITO_APUESTA')).toBe(0);
  });

  it('si cambió la cuota de cualquier selección pide reconfirmar con todas las vigentes', async () => {
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const locales = await tresLocales();
    await request(ctx.app.getHttpServer())
      .put(`/api/operador/selecciones/${locales[1]!.id}/cuota`)
      .set(comoUsuario('operador-1', 'OPERADOR'))
      .send({ cuota: '2.50' })
      .expect(200);

    const respuesta = await apostar(
      usuarioId,
      locales.map((s) => ({ id: s.id, cuota: '2.10' })),
    ).expect(409);

    expect(respuesta.body).toMatchObject({
      codigo: 'CUOTA_CAMBIADA',
      cuotasVigentes: [
        { seleccionId: locales[0]!.id, cuota: '2.10' },
        { seleccionId: locales[1]!.id, cuota: '2.50' },
        { seleccionId: locales[2]!.id, cuota: '2.10' },
      ],
    });
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(0);
  });

  it('una combinada falla entera si cualquiera de sus partidos ya empezó', async () => {
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const [primera, segunda] = await tresLocales();
    const empezado = await crearPartidoConMercados(ctx.prisma, {
      inicioEn: new Date(Date.now() - 60_000),
    });
    const tarde = empezado.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;

    const respuesta = await apostar(usuarioId, [
      { id: primera!.id, cuota: '2.10' },
      { id: segunda!.id, cuota: '2.10' },
      { id: tarde.id, cuota: '2.10' },
    ]).expect(422);

    expect(respuesta.body).toMatchObject({ codigo: 'MERCADO_CERRADO', seleccionId: tarde.id });
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(0);
  });
});
