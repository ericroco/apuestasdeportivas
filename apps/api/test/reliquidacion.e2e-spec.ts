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

const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const ESPERA_MAXIMA_MS = 8_000;

// HU8 (T070): corrección de resultado con re-liquidación controlada y auditada (FR-036 a FR-038).
describe('HU8: corrección de resultados y re-liquidación (e2e)', () => {
  let ctx: AppPrueba;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await crearAppPrueba();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  async function partidoConApuesta(saldo: string, codigo: string, cuota: string, monto = '10.00') {
    const partido = await crearPartidoConMercados(ctx.prisma);
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, saldo);
    const seleccion = partido.mercados[0]!.selecciones.find((s) => s.codigo === codigo)!;
    const apuesta = (
      await http()
        .post('/api/apuestas')
        .set(comoUsuario(usuarioId))
        .send({
          claveSolicitud: randomUUID(),
          monto,
          selecciones: [{ seleccionId: seleccion.id, cuotaVista: cuota }],
        })
        .expect(201)
    ).body as ApuestaDto;
    return { partido, usuarioId, apuesta };
  }

  const resultado = (
    partidoId: string,
    golesLocal: number,
    golesVisitante: number,
    motivo = 'acta oficial',
  ) =>
    http()
      .post(`/api/operador/partidos/${partidoId}/resultado`)
      .set(OPERADOR)
      .send({ golesLocal, golesVisitante, motivo });

  async function finalizar(partidoId: string, golesLocal: number, golesVisitante: number) {
    await http()
      .post(`/api/operador/partidos/${partidoId}/estado`)
      .set(OPERADOR)
      .send({ estado: 'EN_VIVO', motivo: 'inicio' })
      .expect(200);
    await resultado(partidoId, golesLocal, golesVisitante, 'final').expect(200);
  }

  async function esperar(apuestaId: string, estado: string) {
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    for (;;) {
      const apuesta = await ctx.prisma.apuesta.findUniqueOrThrow({ where: { id: apuestaId } });
      if (apuesta.estado === estado || Date.now() > limite) return apuesta;
      await new Promise((listo) => setTimeout(listo, 50));
    }
  }

  const saldo = async (usuarioId: string) =>
    (await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2);

  it('una apuesta que pasa de perdida a ganada recibe su premio una sola vez y queda auditado', async () => {
    const { partido, usuarioId, apuesta } = await partidoConApuesta('100.00', 'EMPATE', '3.20');
    await finalizar(partido.id, 2, 1);
    await esperar(apuesta.id, 'PERDIDA');

    await resultado(partido.id, 1, 1, 'gol anulado por el VAR en el acta').expect(200);
    const corregida = await esperar(apuesta.id, 'GANADA');

    expect(corregida.premioPagado.toFixed(2)).toBe('32.00');
    expect(await saldo(usuarioId)).toBe('122.00');
    expect(await ctx.billetera.contarAsientos(usuarioId, 'PREMIO')).toBe(1);
    const reliquidacion = await ctx.prisma.liquidacion.findFirstOrThrow({
      where: { apuestaId: apuesta.id, tipo: 'RELIQUIDACION' },
    });
    expect(reliquidacion).toMatchObject({ estadoResultante: 'GANADA', versionResultado: 2 });
    expect(ctx.auditoria.porAccion('partido.resultado_corregido')[0]).toMatchObject({
      actorId: 'operador-1',
      entidadId: partido.id,
      datos: { anterior: [2, 1], nuevo: [1, 1], motivo: 'gol anulado por el VAR en el acta' },
    });
  });

  it('un premio ya pagado se revierte aunque el saldo quede negativo, y con saldo negativo no se apuesta', async () => {
    const { partido, usuarioId, apuesta } = await partidoConApuesta('10.00', 'LOCAL', '2.10');
    await finalizar(partido.id, 2, 1);
    await esperar(apuesta.id, 'GANADA');
    expect(await saldo(usuarioId)).toBe('21.00');
    // El apostador gasta el premio antes de la corrección.
    const otro = await crearPartidoConMercados(ctx.prisma);
    const local = otro.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;
    await http()
      .post('/api/apuestas')
      .set(comoUsuario(usuarioId))
      .send({
        claveSolicitud: randomUUID(),
        monto: '21.00',
        selecciones: [{ seleccionId: local.id, cuotaVista: '2.10' }],
      })
      .expect(201);

    await resultado(partido.id, 0, 1, 'el gol local fue en fuera de juego').expect(200);
    const revertida = await esperar(apuesta.id, 'PERDIDA');

    expect(revertida.premioPagado.toFixed(2)).toBe('0.00');
    expect(await saldo(usuarioId)).toBe('-21.00');
    expect(await ctx.billetera.contarAsientos(usuarioId, 'REVERSION_PREMIO')).toBe(1);
    const nueva = await http()
      .post('/api/apuestas')
      .set(comoUsuario(usuarioId))
      .send({
        claveSolicitud: randomUUID(),
        monto: '1.00',
        selecciones: [{ seleccionId: local.id, cuotaVista: '2.10' }],
      })
      .expect(422);
    expect(nueva.body.codigo).toBe('SALDO_NEGATIVO');
  });

  it('procesar la misma corrección dos veces no cambia ningún saldo la segunda vez', async () => {
    const { partido, usuarioId, apuesta } = await partidoConApuesta('100.00', 'EMPATE', '3.20');
    await finalizar(partido.id, 2, 1);
    await esperar(apuesta.id, 'PERDIDA');
    await resultado(partido.id, 1, 1).expect(200);
    await esperar(apuesta.id, 'GANADA');

    // Reenviar el mismo resultado no crea otra versión; reprocesarla tampoco paga de nuevo.
    await resultado(partido.id, 1, 1).expect(200);
    const servicio = ctx.app.get(LiquidacionService);
    for (let i = 0; i < 3; i += 1) await servicio.reliquidarPartido(partido.id, 2);

    expect(
      (await ctx.prisma.partido.findUniqueOrThrow({ where: { id: partido.id } })).versionResultado,
    ).toBe(2);
    expect(await saldo(usuarioId)).toBe('122.00');
    expect(await ctx.billetera.contarAsientos(usuarioId, 'PREMIO')).toBe(1);
  });

  it('ganada → perdida → ganada paga y revierte una sola vez por corrección: el neto es un premio', async () => {
    const { partido, usuarioId, apuesta } = await partidoConApuesta('100.00', 'LOCAL', '2.10');
    await finalizar(partido.id, 1, 0);
    await esperar(apuesta.id, 'GANADA');

    await resultado(partido.id, 1, 1).expect(200);
    await esperar(apuesta.id, 'PERDIDA');
    await resultado(partido.id, 2, 1).expect(200);
    const final = await esperar(apuesta.id, 'GANADA');

    expect(final.premioPagado.toFixed(2)).toBe('21.00');
    expect(await saldo(usuarioId)).toBe('111.00');
    expect(await ctx.billetera.contarAsientos(usuarioId, 'PREMIO')).toBe(2);
    expect(await ctx.billetera.contarAsientos(usuarioId, 'REVERSION_PREMIO')).toBe(1);
  });

  it('una combinada perdida por un partido corregido vuelve a esperar a su otro partido', async () => {
    const competicion = await crearCompeticion(ctx.prisma);
    const [primero, segundo] = await Promise.all([
      crearPartidoConMercados(ctx.prisma, { competicionId: competicion.id }),
      crearPartidoConMercados(ctx.prisma, { competicionId: competicion.id }),
    ]);
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const local = (p: typeof primero) =>
      p.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;
    const combinada = (
      await http()
        .post('/api/apuestas')
        .set(comoUsuario(usuarioId))
        .send({
          claveSolicitud: randomUUID(),
          monto: '10.00',
          selecciones: [
            { seleccionId: local(primero).id, cuotaVista: '2.10' },
            { seleccionId: local(segundo).id, cuotaVista: '2.10' },
          ],
        })
        .expect(201)
    ).body as ApuestaDto;
    await finalizar(primero.id, 0, 1);
    await esperar(combinada.id, 'PERDIDA');

    await resultado(primero.id, 1, 0).expect(200);
    expect((await esperar(combinada.id, 'PENDIENTE')).liquidadaEn).toBeNull();

    await finalizar(segundo.id, 2, 0);
    const ganada = await esperar(combinada.id, 'GANADA');
    expect(ganada.premioPagado.toFixed(2)).toBe('44.10');
  });

  it('la corrección exige motivo y solo la hacen operador o administrador', async () => {
    const { partido } = await partidoConApuesta('100.00', 'LOCAL', '2.10');
    await finalizar(partido.id, 1, 0);

    await http()
      .post(`/api/operador/partidos/${partido.id}/resultado`)
      .set(OPERADOR)
      .send({ golesLocal: 0, golesVisitante: 0 })
      .expect(400);
    await http()
      .post(`/api/operador/partidos/${partido.id}/resultado`)
      .set(comoUsuario('apostador-1'))
      .send({ golesLocal: 0, golesVisitante: 0, motivo: 'x' })
      .expect(403);
  });

  it('el marcador de un partido finalizado no se cambia por la ruta de marcador (sin re-liquidar)', async () => {
    const { partido } = await partidoConApuesta('100.00', 'LOCAL', '2.10');
    await finalizar(partido.id, 1, 0);

    await http()
      .post(`/api/operador/partidos/${partido.id}/marcador`)
      .set(OPERADOR)
      .send({ golesLocal: 0, golesVisitante: 0 })
      .expect(409);
  });
});
