import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  type ApuestaDto,
  type ApuestaLiquidadaPayload,
  ESPACIO_TIEMPO_REAL,
  EVENTOS_TIEMPO_REAL,
  type TicketTiempoRealDto,
} from '@apuestas/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { type ApuestaLiquidada, EVENTOS } from '../src/contracts/index.js';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import {
  crearCompeticion,
  crearPartidoConMercados,
  crearUsuarioConSaldo,
} from './utilidades/fabricas.js';

const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const LATENCIA_MAXIMA_MS = 5_000;

// HU3 (T059): al finalizar el partido se liquidan sus apuestas sin intervención y el dueño lo ve en ≤ 5 s.
describe('HU3: liquidación automática y aviso en tiempo real (e2e)', () => {
  let ctx: AppPrueba;
  let url: string;
  const eventos: ApuestaLiquidada[] = [];
  const sockets: Socket[] = [];
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await crearAppPrueba();
    await ctx.app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
    ctx.app.get(EventEmitter2).on(EVENTOS.apuestaLiquidada, (evento: ApuestaLiquidada) => {
      eventos.push(evento);
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.limpiar();
    eventos.length = 0;
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  const apostar = (usuarioId: string, selecciones: Array<{ id: string; cuota: string }>) =>
    http()
      .post('/api/apuestas')
      .set(comoUsuario(usuarioId))
      .send({
        claveSolicitud: randomUUID(),
        monto: '10.00',
        selecciones: selecciones.map((s) => ({ seleccionId: s.id, cuotaVista: s.cuota })),
      })
      .expect(201)
      .then((r) => r.body as ApuestaDto);

  async function dosPartidos() {
    const competicion = await crearCompeticion(ctx.prisma);
    const [primero, segundo] = await Promise.all([
      crearPartidoConMercados(ctx.prisma, { competicionId: competicion.id }),
      crearPartidoConMercados(ctx.prisma, { competicionId: competicion.id }),
    ]);
    const codigo = (p: typeof primero, c: string) =>
      p.mercados[0]!.selecciones.find((s) => s.codigo === c)!;
    return { primero, segundo, codigo };
  }

  async function finalizar(partidoId: string, golesLocal: number, golesVisitante: number) {
    await http()
      .post(`/api/operador/partidos/${partidoId}/estado`)
      .set(OPERADOR)
      .send({ estado: 'EN_VIVO', motivo: 'inicio' })
      .expect(200);
    await http()
      .post(`/api/operador/partidos/${partidoId}/resultado`)
      .set(OPERADOR)
      .send({ golesLocal, golesVisitante, motivo: 'final del partido' })
      .expect(200);
  }

  async function esperarEstado(apuestaId: string, distinto = 'PENDIENTE') {
    const limite = Date.now() + LATENCIA_MAXIMA_MS;
    for (;;) {
      const apuesta = await ctx.prisma.apuesta.findUniqueOrThrow({ where: { id: apuestaId } });
      if (apuesta.estado !== distinto || Date.now() > limite) return apuesta;
      await new Promise((listo) => setTimeout(listo, 50));
    }
  }

  async function conectar(usuarioId: string): Promise<Socket> {
    const { ticket } = (
      await http().post('/api/tiempo-real/ticket').set(comoUsuario(usuarioId)).expect(201)
    ).body as TicketTiempoRealDto;
    const socket = io(url + ESPACIO_TIEMPO_REAL, {
      auth: { ticket },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((listo, fallo) => {
      socket.once('connect', () => listo());
      socket.once('connect_error', fallo);
    });
    return socket;
  }

  it('paga a las ganadoras, no mueve dinero a las perdedoras y emite apuesta.liquidada', async () => {
    const { primero, codigo } = await dosPartidos();
    const ganador = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const perdedor = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const ganadora = await apostar(ganador, [{ id: codigo(primero, 'LOCAL').id, cuota: '2.10' }]);
    const perdedora = await apostar(perdedor, [
      { id: codigo(primero, 'EMPATE').id, cuota: '3.20' },
    ]);

    await finalizar(primero.id, 2, 1);

    expect(await esperarEstado(ganadora.id)).toMatchObject({ estado: 'GANADA' });
    expect((await esperarEstado(ganadora.id)).premioPagado.toFixed(2)).toBe('21.00');
    expect(await esperarEstado(perdedora.id)).toMatchObject({ estado: 'PERDIDA' });
    expect((await ctx.billetera.obtenerSaldos(ganador)).real.toFixed(2)).toBe('111.00');
    expect((await ctx.billetera.obtenerSaldos(perdedor)).real.toFixed(2)).toBe('90.00');
    expect(await ctx.billetera.contarAsientos(perdedor, 'PREMIO')).toBe(0);

    const liquidacion = await ctx.prisma.liquidacion.findFirstOrThrow({
      where: { apuestaId: ganadora.id },
    });
    expect(liquidacion).toMatchObject({
      tipo: 'LIQUIDACION',
      estadoResultante: 'GANADA',
      versionResultado: 1,
    });
    expect(liquidacion.montoMovido.toFixed(2)).toBe('21.00');
    expect(eventos).toEqual(
      expect.arrayContaining([
        {
          usuarioId: ganador,
          apuestaId: ganadora.id,
          resultado: 'GANADA',
          monto: '10.00',
          premio: '21.00',
        },
        {
          usuarioId: perdedor,
          apuestaId: perdedora.id,
          resultado: 'PERDIDA',
          monto: '10.00',
          premio: '0.00',
        },
      ]),
    );
    expect(ctx.auditoria.porAccion('apuesta.liquidada')).toHaveLength(2);
  });

  it('el dueño ve el resultado de su apuesta por WebSocket en 5 s o menos, sin recargar', async () => {
    const { primero, codigo } = await dosPartidos();
    const ganador = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const ganadora = await apostar(ganador, [{ id: codigo(primero, 'LOCAL').id, cuota: '2.10' }]);
    const socket = await conectar(ganador);
    const ajeno = await conectar('otro-apostador');
    let ajenoRecibio = false;
    ajeno.on(EVENTOS_TIEMPO_REAL.apuestaLiquidada, () => {
      ajenoRecibio = true;
    });
    const aviso = new Promise<ApuestaLiquidadaPayload>((listo) =>
      socket.once(EVENTOS_TIEMPO_REAL.apuestaLiquidada, listo),
    );

    await http()
      .post(`/api/operador/partidos/${primero.id}/estado`)
      .set(OPERADOR)
      .send({ estado: 'EN_VIVO', motivo: 'inicio' })
      .expect(200);
    const inicio = Date.now();
    await http()
      .post(`/api/operador/partidos/${primero.id}/resultado`)
      .set(OPERADOR)
      .send({ golesLocal: 1, golesVisitante: 0, motivo: 'final' })
      .expect(200);
    const payload = await aviso;
    const latencia = Date.now() - inicio;

    expect(payload).toMatchObject({ apuestaId: ganadora.id, estado: 'GANADA', premio: '21.00' });
    expect(latencia).toBeLessThanOrEqual(LATENCIA_MAXIMA_MS);
    expect(ajenoRecibio).toBe(false);
    process.stdout.write(`[SC-001] latencia resultado → aviso: ${latencia} ms\n`);
  });

  it('una combinada queda pendiente hasta el último partido y luego cobra con la cuota total', async () => {
    const { primero, segundo, codigo } = await dosPartidos();
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const combinada = await apostar(usuarioId, [
      { id: codigo(primero, 'LOCAL').id, cuota: '2.10' },
      { id: codigo(segundo, 'LOCAL').id, cuota: '2.10' },
    ]);

    await finalizar(primero.id, 1, 0);
    await new Promise((listo) => setTimeout(listo, 500));
    expect(
      (await ctx.prisma.apuesta.findUniqueOrThrow({ where: { id: combinada.id } })).estado,
    ).toBe('PENDIENTE');

    await finalizar(segundo.id, 3, 0);
    const liquidada = await esperarEstado(combinada.id);

    // 2.10 × 2.10 = 4.41; 10.00 × 4.41 = 44.10
    expect(liquidada.estado).toBe('GANADA');
    expect(liquidada.premioPagado.toFixed(2)).toBe('44.10');
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('134.10');
  });

  it('una combinada pierde en cuanto falla una selección, aunque falten partidos', async () => {
    const { primero, segundo, codigo } = await dosPartidos();
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const combinada = await apostar(usuarioId, [
      { id: codigo(primero, 'LOCAL').id, cuota: '2.10' },
      { id: codigo(segundo, 'LOCAL').id, cuota: '2.10' },
    ]);

    await finalizar(primero.id, 0, 2);

    expect((await esperarEstado(combinada.id)).estado).toBe('PERDIDA');
    expect(await ctx.billetera.contarAsientos(usuarioId, 'PREMIO')).toBe(0);
  });

  it('no se puede cargar el resultado de un partido cancelado (409)', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma, { estado: 'CANCELADO' });

    const respuesta = await http()
      .post(`/api/operador/partidos/${partido.id}/resultado`)
      .set(OPERADOR)
      .send({ golesLocal: 1, golesVisitante: 0, motivo: 'x' })
      .expect(409);
    expect(respuesta.body.codigo).toBe('TRANSICION_INVALIDA');
  });
});
