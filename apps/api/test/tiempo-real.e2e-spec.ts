import type { AddressInfo } from 'node:net';
import {
  ESPACIO_TIEMPO_REAL,
  EVENTOS_TIEMPO_REAL,
  type MercadoActualizadoPayload,
  type PartidoActualizadoPayload,
  type TicketTiempoRealDto,
} from '@apuestas/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados } from './utilidades/fabricas.js';

const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const APOSTADOR = comoUsuario('apostador-1');
const ESPERA_MS = 3_000;

// HU5 (T028): ticket de un solo uso, conexión rechazada sin ticket válido y eventos de partido por sala.
describe('Tiempo real: ticket y gateway Socket.IO (e2e)', () => {
  let ctx: AppPrueba;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await crearAppPrueba();
    await ctx.app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  async function pedirTicket(cabecera = APOSTADOR): Promise<string> {
    const respuesta = await request(ctx.app.getHttpServer())
      .post('/api/tiempo-real/ticket')
      .set(cabecera)
      .expect(201);
    return (respuesta.body as TicketTiempoRealDto).ticket;
  }

  function conectar(ticket?: string): Socket {
    const socket = io(url + ESPACIO_TIEMPO_REAL, {
      auth: ticket ? { ticket } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  function resultadoConexion(socket: Socket): Promise<string> {
    return new Promise((resolver) => {
      socket.once('connect', () => resolver('conectado'));
      socket.once('connect_error', (error) => resolver(error.message));
    });
  }

  function esperarEvento<T>(socket: Socket, evento: string): Promise<T> {
    return new Promise((resolver, rechazar) => {
      const temporizador = setTimeout(() => rechazar(new Error(`sin ${evento}`)), ESPERA_MS);
      socket.once(evento, (payload: T) => {
        clearTimeout(temporizador);
        resolver(payload);
      });
    });
  }

  it('sin sesión no se puede pedir un ticket (401)', async () => {
    await request(ctx.app.getHttpServer()).post('/api/tiempo-real/ticket').expect(401);
  });

  it('conecta con un ticket válido y lo rechaza si se reutiliza', async () => {
    const ticket = await pedirTicket();

    expect(await resultadoConexion(conectar(ticket))).toBe('conectado');
    expect(await resultadoConexion(conectar(ticket))).toBe('TICKET_INVALIDO');
  });

  it('rechaza la conexión sin ticket o con uno inventado', async () => {
    expect(await resultadoConexion(conectar())).toBe('TICKET_INVALIDO');
    expect(await resultadoConexion(conectar('inventado'))).toBe('TICKET_INVALIDO');
  });

  it('quien sigue un partido recibe partido.actualizado y mercado.actualizado tras el commit', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);
    const socket = conectar(await pedirTicket());
    expect(await resultadoConexion(socket)).toBe('conectado');
    expect(
      await socket.emitWithAck(EVENTOS_TIEMPO_REAL.partidoSeguir, { partidoId: partido.id }),
    ).toEqual({
      ok: true,
    });

    const actualizado = esperarEvento<PartidoActualizadoPayload>(
      socket,
      EVENTOS_TIEMPO_REAL.partidoActualizado,
    );
    await request(ctx.app.getHttpServer())
      .post(`/api/operador/partidos/${partido.id}/estado`)
      .set(OPERADOR)
      .send({ estado: 'EN_VIVO', motivo: 'inicio' })
      .expect(200);
    expect(await actualizado).toMatchObject({
      partidoId: partido.id,
      estado: 'EN_VIVO',
      golesLocal: 0,
      emitidoEn: expect.any(String),
    });

    const partidoConVivo = await crearPartidoConMercados(ctx.prisma);
    await socket.emitWithAck(EVENTOS_TIEMPO_REAL.partidoSeguir, { partidoId: partidoConVivo.id });
    const mercado = esperarEvento<MercadoActualizadoPayload>(
      socket,
      EVENTOS_TIEMPO_REAL.mercadoActualizado,
    );
    const seleccion = partidoConVivo.mercados[0]!.selecciones[0]!;
    await request(ctx.app.getHttpServer())
      .put(`/api/operador/selecciones/${seleccion.id}/cuota`)
      .set(OPERADOR)
      .send({ cuota: '4.00' })
      .expect(200);
    expect((await mercado).selecciones).toContainEqual({ id: seleccion.id, cuota: '4.00' });
  });

  it('quien no sigue el partido no recibe sus eventos', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);
    const socket = conectar(await pedirTicket());
    expect(await resultadoConexion(socket)).toBe('conectado');

    const recibido = esperarEvento(socket, EVENTOS_TIEMPO_REAL.partidoActualizado).then(
      () => true,
      () => false,
    );
    await request(ctx.app.getHttpServer())
      .post(`/api/operador/partidos/${partido.id}/estado`)
      .set(OPERADOR)
      .send({ estado: 'EN_VIVO', motivo: 'inicio' })
      .expect(200);

    expect(await recibido).toBe(false);
  });

  it('rechaza seguir un partido con un id inválido', async () => {
    const socket = conectar(await pedirTicket());
    expect(await resultadoConexion(socket)).toBe('conectado');

    expect(await socket.emitWithAck(EVENTOS_TIEMPO_REAL.partidoSeguir, { partidoId: 'x' })).toEqual(
      {
        ok: false,
        motivo: 'partidoId inválido',
      },
    );
  });
});
