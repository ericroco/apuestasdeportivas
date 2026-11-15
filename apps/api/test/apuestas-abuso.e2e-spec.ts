import { randomUUID } from 'node:crypto';
import type { ApuestaDto, Pagina } from '@apuestas/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { Decimal } from '../src/comun/decimal.js';
import { type ApuestaAceptada, EVENTOS } from '../src/contracts/index.js';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados, crearUsuarioConSaldo } from './utilidades/fabricas.js';

// HU2 (T040): vectores de fraude de la aceptación. Ningún rechazo deja apuesta ni movimiento de dinero (SC-002).
describe('HU2: aceptación de apuestas y abuso (e2e)', () => {
  let ctx: AppPrueba;
  const eventos: ApuestaAceptada[] = [];

  beforeAll(async () => {
    ctx = await crearAppPrueba();
    ctx.app.get(EventEmitter2).on(EVENTOS.apuestaAceptada, (evento: ApuestaAceptada) => {
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

  async function escenario(saldo = '100.00', opciones = {}) {
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, saldo);
    const partido = await crearPartidoConMercados(ctx.prisma, opciones);
    const local = partido.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;
    return { usuarioId, partido, local };
  }

  const apostar = (usuarioId: string, cuerpo: Record<string, unknown>) =>
    request(ctx.app.getHttpServer()).post('/api/apuestas').set(comoUsuario(usuarioId)).send(cuerpo);

  const cuerpoSimple = (seleccionId: string, monto = '10.00', cuotaVista = '2.10') => ({
    claveSolicitud: randomUUID(),
    monto,
    selecciones: [{ seleccionId, cuotaVista }],
  });

  async function sinEfectos(usuarioId: string, saldoEsperado: string): Promise<void> {
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(0);
    expect(await ctx.billetera.contarAsientos(usuarioId, 'DEBITO_APUESTA')).toBe(0);
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe(saldoEsperado);
  }

  it('acepta una simple: descuenta el monto exacto, congela la cuota, audita y emite el evento', async () => {
    const { usuarioId, local } = await escenario();

    const respuesta = await apostar(usuarioId, cuerpoSimple(local.id)).expect(201);
    const apuesta = respuesta.body as ApuestaDto;

    expect(apuesta).toMatchObject({
      tipo: 'SIMPLE',
      estado: 'PENDIENTE',
      monto: '10.00',
      tipoSaldo: 'REAL',
      cuotaTotal: '2.10',
      gananciaPotencial: '21.00',
      premioPagado: '0.00',
      selecciones: [{ seleccionId: local.id, cuotaCongelada: '2.10', resultado: 'PENDIENTE' }],
    });
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('90.00');
    expect(ctx.auditoria.porAccion('apuesta.aceptada')[0]).toMatchObject({
      actorId: usuarioId,
      entidadId: apuesta.id,
    });
    expect(eventos).toEqual([
      { usuarioId, apuestaId: apuesta.id, monto: '10.00', tipoSaldo: 'REAL' },
    ]);
  });

  it('la cuota aceptada no cambia si el operador cambia la cuota después', async () => {
    const { usuarioId, local } = await escenario();
    const apuesta = (await apostar(usuarioId, cuerpoSimple(local.id)).expect(201))
      .body as ApuestaDto;

    await request(ctx.app.getHttpServer())
      .put(`/api/operador/selecciones/${local.id}/cuota`)
      .set(comoUsuario('operador-1', 'OPERADOR'))
      .send({ cuota: '3.00' })
      .expect(200);

    const guardada = await request(ctx.app.getHttpServer())
      .get(`/api/apuestas/${apuesta.id}`)
      .set(comoUsuario(usuarioId))
      .expect(200);
    expect((guardada.body as ApuestaDto).selecciones[0]!.cuotaCongelada).toBe('2.10');
  });

  it('sin saldo suficiente se rechaza indicando el disponible y sin efectos', async () => {
    const { usuarioId, local } = await escenario('5.00');

    const respuesta = await apostar(usuarioId, cuerpoSimple(local.id)).expect(422);

    expect(respuesta.body).toMatchObject({ codigo: 'SALDO_INSUFICIENTE', saldoDisponible: '5.00' });
    await sinEfectos(usuarioId, '5.00');
    expect(eventos).toHaveLength(0);
  });

  it('después de la hora de inicio (reloj del servidor) el mercado está cerrado', async () => {
    const { usuarioId, local } = await escenario('100.00', {
      inicioEn: new Date(Date.now() - 60_000),
    });

    const respuesta = await apostar(usuarioId, cuerpoSimple(local.id)).expect(422);

    expect(respuesta.body.codigo).toBe('MERCADO_CERRADO');
    await sinEfectos(usuarioId, '100.00');
  });

  it('el cliente no puede mandar su hora, cuota total ni ganancia (.strict → 400)', async () => {
    const { usuarioId, local } = await escenario();
    const base = cuerpoSimple(local.id);

    await apostar(usuarioId, { ...base, hora: new Date().toISOString() }).expect(400);
    await apostar(usuarioId, { ...base, gananciaPotencial: '9999.00' }).expect(400);
    await apostar(usuarioId, { ...base, cuotaTotal: '50.00' }).expect(400);
    await sinEfectos(usuarioId, '100.00');
  });

  it('si la cuota cambió, pide reconfirmar con las cuotas vigentes (409) y no acepta', async () => {
    const { usuarioId, local } = await escenario();

    const respuesta = await apostar(usuarioId, cuerpoSimple(local.id, '10.00', '2.00')).expect(409);

    expect(respuesta.body).toMatchObject({
      codigo: 'CUOTA_CAMBIADA',
      cuotasVigentes: [{ seleccionId: local.id, cuota: '2.10' }],
    });
    await sinEfectos(usuarioId, '100.00');
  });

  it('rechaza un mercado suspendido', async () => {
    const { usuarioId, local } = await escenario('100.00', {
      mercados: [{ estado: 'SUSPENDIDO' }],
    });

    const respuesta = await apostar(usuarioId, cuerpoSimple(local.id)).expect(422);
    expect(respuesta.body.codigo).toBe('MERCADO_CERRADO');
  });

  it('aplica los límites de monto e informa cuál se superó', async () => {
    const { usuarioId, local } = await escenario('1000.00');

    const minimo = await apostar(usuarioId, cuerpoSimple(local.id, '0.10')).expect(422);
    expect(minimo.body).toMatchObject({ codigo: 'LIMITE_EXCEDIDO', limite: 'MONTO_MIN' });
    const maximo = await apostar(usuarioId, cuerpoSimple(local.id, '600.00')).expect(422);
    expect(maximo.body).toMatchObject({ limite: 'MONTO_MAX', valorPermitido: '500.00' });
    await sinEfectos(usuarioId, '1000.00');
  });

  it('rechaza montos con más de dos decimales, cero o negativos (400)', async () => {
    const { usuarioId, local } = await escenario();

    for (const monto of ['10.005', '0', '-5.00', '0.00']) {
      await apostar(usuarioId, cuerpoSimple(local.id, monto)).expect(400);
    }
  });

  it('con saldo negativo por una reversión no se puede apostar (SALDO_NEGATIVO)', async () => {
    const { usuarioId, local } = await escenario('1.00');
    await ctx.prisma.$transaction((tx) =>
      ctx.billetera.revertirPremio(tx, {
        usuarioId,
        apuestaId: randomUUID(),
        tipoSaldo: 'REAL',
        monto: new Decimal('5.00'),
        claveIdempotencia: `apuesta:${randomUUID()}:reversion:r1`,
      }),
    );

    const respuesta = await apostar(usuarioId, cuerpoSimple(local.id, '0.50')).expect(422);
    expect(respuesta.body.codigo).toBe('SALDO_NEGATIVO');
  });

  it('un operador o administrador no puede apostar (403)', async () => {
    const { local } = await escenario();

    await request(ctx.app.getHttpServer())
      .post('/api/apuestas')
      .set(comoUsuario('operador-1', 'OPERADOR'))
      .send(cuerpoSimple(local.id))
      .expect(403);
    const mixto = await request(ctx.app.getHttpServer())
      .post('/api/apuestas')
      .set(comoUsuario('mixto-1', 'APOSTADOR', 'ADMINISTRADOR'))
      .send(cuerpoSimple(local.id))
      .expect(403);
    expect(mixto.body.codigo).toBe('ROL_NO_PUEDE_APOSTAR');
  });

  it('con cupón y sin el Spec 4 se rechaza con un mensaje claro y sin descontar (422)', async () => {
    const { usuarioId, local } = await escenario();

    const respuesta = await apostar(usuarioId, {
      ...cuerpoSimple(local.id),
      codigoCupon: 'BIENVENIDA',
    }).expect(422);

    expect(respuesta.body.codigo).toBe('CUPON_INVALIDO');
    await sinEfectos(usuarioId, '100.00');
  });

  it('rechaza una selección inexistente (404)', async () => {
    const { usuarioId } = await escenario();

    await apostar(usuarioId, cuerpoSimple(randomUUID())).expect(404);
  });

  it('cada apostador solo ve sus propias apuestas', async () => {
    const { usuarioId, local } = await escenario();
    const otro = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const propia = (await apostar(usuarioId, cuerpoSimple(local.id)).expect(201))
      .body as ApuestaDto;
    await apostar(otro, cuerpoSimple(local.id)).expect(201);

    const lista = await request(ctx.app.getHttpServer())
      .get('/api/apuestas')
      .set(comoUsuario(usuarioId))
      .expect(200);
    expect((lista.body as Pagina<ApuestaDto>).elementos.map((a) => a.id)).toEqual([propia.id]);
    await request(ctx.app.getHttpServer())
      .get(`/api/apuestas/${propia.id}`)
      .set(comoUsuario(otro))
      .expect(404);
  });
});
