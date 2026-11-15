import { randomUUID } from 'node:crypto';
import type { ApuestaDto } from '@apuestas/shared';
import request from 'supertest';
import { LiquidacionService } from '../src/liquidacion/liquidacion.service.js';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import {
  crearCompeticion,
  crearPartidoConMercados,
  crearUsuarioConSaldo,
} from './utilidades/fabricas.js';

/** 0.001 h = 3.6 s: el plazo vence durante la prueba. */
const PLAZO_HORAS = '0.001';
const PLAZO_MS = 3_600;
const ESPERA_MAXIMA_MS = 12_000;
const OPERADOR = comoUsuario('operador-1', 'OPERADOR');

// Estas pruebas esperan a que venza el plazo: necesitan más que los 5 s por defecto de Vitest.
vi.setConfig({ testTimeout: 30_000 });

// HU6 (T066): suspensiones, aplazamientos y cancelaciones (FR-031 a FR-035).
describe('HU6: suspensiones, plazos y anulaciones (e2e)', () => {
  const entornoOriginal = { ...process.env };
  let ctx: AppPrueba;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    process.env.SUSPENSION_PLAZO_HORAS = PLAZO_HORAS;
    ctx = await crearAppPrueba();
  });

  afterAll(async () => {
    await ctx.app.close();
    process.env = entornoOriginal;
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  const MERCADOS = [
    {},
    { tipo: 'MAS_MENOS_GOLES' as const, linea: '1.5', cuotas: { MAS: '1.40', MENOS: '2.80' } },
    { tipo: 'MAS_MENOS_GOLES' as const, linea: '2.5', cuotas: { MAS: '1.90', MENOS: '1.90' } },
  ];

  async function partido(competicionId?: string) {
    const creado = await crearPartidoConMercados(ctx.prisma, {
      mercados: MERCADOS,
      ...(competicionId ? { competicionId } : {}),
    });
    const seleccion = (tipo: string, codigo: string, linea: string | null = null) =>
      creado.mercados
        .find((m) => m.tipo === tipo && (m.linea?.toFixed(1) ?? null) === linea)!
        .selecciones.find((s) => s.codigo === codigo)!;
    return { ...creado, seleccion };
  }

  const apostar = (
    usuarioId: string,
    selecciones: Array<{ id: string; cuota: { toFixed(n: number): string } }>,
  ) =>
    http()
      .post('/api/apuestas')
      .set(comoUsuario(usuarioId))
      .send({
        claveSolicitud: randomUUID(),
        monto: '10.00',
        selecciones: selecciones.map((s) => ({
          seleccionId: s.id,
          cuotaVista: s.cuota.toFixed(2),
        })),
      })
      .expect(201)
      .then((r) => r.body as ApuestaDto);

  const estado = (partidoId: string, cuerpo: Record<string, unknown>) =>
    http()
      .post(`/api/operador/partidos/${partidoId}/estado`)
      .set(OPERADOR)
      .send(cuerpo)
      .expect(200);

  async function enVivoSuspendido(partidoId: string, golesLocal: number, golesVisitante: number) {
    await estado(partidoId, { estado: 'EN_VIVO', motivo: 'inicio' });
    await http()
      .post(`/api/operador/partidos/${partidoId}/marcador`)
      .set(OPERADOR)
      .send({ golesLocal, golesVisitante, minuto: 40 })
      .expect(200);
    await estado(partidoId, { estado: 'SUSPENDIDO', motivo: 'tormenta' });
  }

  async function esperarApuesta(
    id: string,
    condicion: (estado: string, apuesta: { cuotaTotal: { toFixed(n: number): string } }) => boolean,
  ) {
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    for (;;) {
      const apuesta = await ctx.prisma.apuesta.findUniqueOrThrow({ where: { id } });
      if (condicion(apuesta.estado, apuesta) || Date.now() > limite) return apuesta;
      await new Promise((listo) => setTimeout(listo, 100));
    }
  }

  const saldo = async (usuarioId: string) =>
    (await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2);

  it('un partido suspendido que se reanuda dentro del plazo mantiene las apuestas y luego se liquida', async () => {
    const p = await partido();
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const apuesta = await apostar(usuarioId, [p.seleccion('RESULTADO_FINAL', 'LOCAL')]);
    await enVivoSuspendido(p.id, 1, 0);

    await estado(p.id, { estado: 'EN_VIVO', motivo: 'se reanuda' });
    await new Promise((listo) => setTimeout(listo, PLAZO_MS + 1_500));

    expect((await ctx.prisma.apuesta.findUniqueOrThrow({ where: { id: apuesta.id } })).estado).toBe(
      'PENDIENTE',
    );
    expect((await ctx.prisma.partido.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe(
      'EN_VIVO',
    );
    await http()
      .post(`/api/operador/partidos/${p.id}/resultado`)
      .set(OPERADOR)
      .send({ golesLocal: 1, golesVisitante: 0, motivo: 'final' })
      .expect(200);
    expect((await esperarApuesta(apuesta.id, (e) => e !== 'PENDIENTE')).estado).toBe('GANADA');
  });

  it('al vencer el plazo, sin intervención, anula las simples y reembolsa una sola vez', async () => {
    const p = await partido();
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const apuesta = await apostar(usuarioId, [p.seleccion('RESULTADO_FINAL', 'LOCAL')]);
    await enVivoSuspendido(p.id, 0, 0);

    const anulada = await esperarApuesta(apuesta.id, (e) => e !== 'PENDIENTE');

    expect(anulada.estado).toBe('ANULADA');
    expect(await saldo(usuarioId)).toBe('100.00');
    expect(await ctx.billetera.contarAsientos(usuarioId, 'REEMBOLSO')).toBe(1);
    expect((await ctx.prisma.partido.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe(
      'CANCELADO',
    );
    expect(ctx.auditoria.porAccion('partido.anulado_por_plazo')).toHaveLength(1);
  });

  it('reprocesar el vencimiento no reembolsa dos veces', async () => {
    const p = await partido();
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const apuesta = await apostar(usuarioId, [p.seleccion('RESULTADO_FINAL', 'LOCAL')]);
    await enVivoSuspendido(p.id, 0, 0);
    await esperarApuesta(apuesta.id, (e) => e !== 'PENDIENTE');

    const servicio = ctx.app.get(LiquidacionService);
    for (let i = 0; i < 5; i += 1) await servicio.anularPartido(p.id);

    expect(await ctx.billetera.contarAsientos(usuarioId, 'REEMBOLSO')).toBe(1);
    expect(await saldo(usuarioId)).toBe('100.00');
  });

  it('un partido cancelado anula y reembolsa sus apuestas de inmediato', async () => {
    const p = await partido();
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const apuesta = await apostar(usuarioId, [p.seleccion('RESULTADO_FINAL', 'EMPATE')]);

    await estado(p.id, { estado: 'CANCELADO', motivo: 'estadio clausurado' });

    const anulada = await esperarApuesta(apuesta.id, (e) => e !== 'PENDIENTE');
    expect(anulada.estado).toBe('ANULADA');
    expect(await saldo(usuarioId)).toBe('100.00');
  });

  it('en una combinada la selección anulada cuenta con 1.00: la cuota se recalcula y el resto sigue', async () => {
    const competicion = await crearCompeticion(ctx.prisma);
    const cancelado = await partido(competicion.id);
    const vigente = await partido(competicion.id);
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const combinada = await apostar(usuarioId, [
      cancelado.seleccion('RESULTADO_FINAL', 'LOCAL'),
      vigente.seleccion('RESULTADO_FINAL', 'VISITANTE'),
    ]);
    expect(combinada.cuotaTotal).toBe('7.35');

    await estado(cancelado.id, { estado: 'CANCELADO', motivo: 'suspendido por la liga' });
    const recalculada = await esperarApuesta(
      combinada.id,
      (_estado, apuesta) => apuesta.cuotaTotal.toFixed(2) !== '7.35',
    );
    expect(recalculada.estado).toBe('PENDIENTE');
    expect(recalculada.cuotaTotal.toFixed(2)).toBe('3.50');

    await estado(vigente.id, { estado: 'EN_VIVO', motivo: 'inicio' });
    await http()
      .post(`/api/operador/partidos/${vigente.id}/resultado`)
      .set(OPERADOR)
      .send({ golesLocal: 0, golesVisitante: 1, motivo: 'final' })
      .expect(200);
    const ganada = await esperarApuesta(combinada.id, (e) => e !== 'PENDIENTE');
    expect(ganada.estado).toBe('GANADA');
    expect(ganada.premioPagado.toFixed(2)).toBe('35.00');
    expect(await saldo(usuarioId)).toBe('125.00');
  });

  it('una combinada con todas sus selecciones anuladas se reembolsa completa', async () => {
    const competicion = await crearCompeticion(ctx.prisma);
    const primero = await partido(competicion.id);
    const segundo = await partido(competicion.id);
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const combinada = await apostar(usuarioId, [
      primero.seleccion('RESULTADO_FINAL', 'LOCAL'),
      segundo.seleccion('RESULTADO_FINAL', 'LOCAL'),
    ]);

    await estado(primero.id, { estado: 'CANCELADO', motivo: 'x' });
    await estado(segundo.id, { estado: 'CANCELADO', motivo: 'x' });

    expect((await esperarApuesta(combinada.id, (e) => e !== 'PENDIENTE')).estado).toBe('ANULADA');
    expect(await saldo(usuarioId)).toBe('100.00');
    expect(await ctx.billetera.contarAsientos(usuarioId, 'REEMBOLSO')).toBe(1);
  });

  it('al anular por plazo, los mercados ya decididos con el marcador de la suspensión se liquidan (FR-031)', async () => {
    const p = await partido();
    const [a, b, c, d] = await Promise.all(
      [0, 1, 2, 3].map(() => crearUsuarioConSaldo(ctx.billetera, '100.00')),
    );
    const mas15 = await apostar(a!, [p.seleccion('MAS_MENOS_GOLES', 'MAS', '1.5')]);
    const menos15 = await apostar(b!, [p.seleccion('MAS_MENOS_GOLES', 'MENOS', '1.5')]);
    const mas25 = await apostar(c!, [p.seleccion('MAS_MENOS_GOLES', 'MAS', '2.5')]);
    const local = await apostar(d!, [p.seleccion('RESULTADO_FINAL', 'LOCAL')]);

    await enVivoSuspendido(p.id, 2, 0);
    const resueltas = await Promise.all(
      [mas15, menos15, mas25, local].map((x) => esperarApuesta(x.id, (e) => e !== 'PENDIENTE')),
    );

    expect(resueltas.map((x) => x.estado)).toEqual(['GANADA', 'PERDIDA', 'ANULADA', 'ANULADA']);
    expect(await saldo(a!)).toBe('104.00');
    expect(await saldo(b!)).toBe('90.00');
    expect(await saldo(c!)).toBe('100.00');
    expect(await saldo(d!)).toBe('100.00');
  });
});
