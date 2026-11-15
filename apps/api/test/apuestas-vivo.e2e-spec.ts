import { randomUUID } from 'node:crypto';
import type { SolicitudVivoAceptadaDto, SolicitudVivoDto } from '@apuestas/shared';
import request from 'supertest';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados, crearUsuarioConSaldo } from './utilidades/fabricas.js';

const RETARDO_MS = 500;
const ESPERA_MAXIMA_MS = 5_000;
const OPERADOR = comoUsuario('operador-1', 'OPERADOR');

// HU7 (T054): las apuestas en vivo esperan el retardo y se revalidan antes de aceptarse (FR-018).
describe('HU7: apuestas en vivo con retardo (e2e)', () => {
  const entornoOriginal = { ...process.env };
  let ctx: AppPrueba;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    process.env.APUESTA_RETARDO_VIVO_MS = String(RETARDO_MS);
    ctx = await crearAppPrueba();
  });

  afterAll(async () => {
    await ctx.app.close();
    process.env = entornoOriginal;
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  /** Partido en vivo 1-0 con un mercado de vivo abierto y el 1X2 pre-partido ya cerrado. */
  async function escenario(saldo = '100.00') {
    const usuarioId = await crearUsuarioConSaldo(ctx.billetera, saldo);
    const partido = await crearPartidoConMercados(ctx.prisma, {
      estado: 'EN_VIVO',
      inicioEn: new Date(Date.now() - 30 * 60 * 1000),
      mercados: [
        { tipo: 'AMBOS_MARCAN', admiteVivo: true, cuotas: { SI: '1.80', NO: '1.95' } },
        { estado: 'CERRADO' },
      ],
    });
    await ctx.prisma.partido.update({
      where: { id: partido.id },
      data: { golesLocal: 1, golesVisitante: 0, minuto: 30 },
    });
    const vivo = partido.mercados.find((m) => m.tipo === 'AMBOS_MARCAN')!;
    const si = vivo.selecciones.find((s) => s.codigo === 'SI')!;
    const local = partido.mercados
      .find((m) => m.tipo === 'RESULTADO_FINAL')!
      .selecciones.find((s) => s.codigo === 'LOCAL')!;
    return { usuarioId, partido, mercadoVivoId: vivo.id, si, local };
  }

  const apostar = (
    usuarioId: string,
    seleccionId: string,
    cuotaVista: string,
    clave = randomUUID(),
  ) =>
    http()
      .post('/api/apuestas')
      .set(comoUsuario(usuarioId))
      .send({ claveSolicitud: clave, monto: '10.00', selecciones: [{ seleccionId, cuotaVista }] });

  async function esperarResolucion(
    usuarioId: string,
    solicitudId: string,
  ): Promise<SolicitudVivoDto> {
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    for (;;) {
      const respuesta = await http()
        .get(`/api/apuestas/solicitudes-vivo/${solicitudId}`)
        .set(comoUsuario(usuarioId))
        .expect(200);
      const solicitud = respuesta.body as SolicitudVivoDto;
      if (solicitud.estado !== 'EN_ESPERA' || Date.now() > limite) return solicitud;
      await new Promise((listo) => setTimeout(listo, 50));
    }
  }

  async function sinApuestaNiDescuento(usuarioId: string): Promise<void> {
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(0);
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('100.00');
  }

  it('queda en espera sin descontar y se acepta al terminar el retardo', async () => {
    const { usuarioId, si } = await escenario();

    const respuesta = await apostar(usuarioId, si.id, '1.80').expect(202);
    const { solicitudId, ejecutarEn } = respuesta.body as SolicitudVivoAceptadaDto;
    expect(new Date(ejecutarEn).getTime()).toBeGreaterThan(Date.now());
    await sinApuestaNiDescuento(usuarioId);

    const resuelta = await esperarResolucion(usuarioId, solicitudId);

    expect(resuelta).toMatchObject({ estado: 'ACEPTADA', motivoRechazo: null });
    const apuesta = await ctx.prisma.apuesta.findUniqueOrThrow({
      where: { id: resuelta.apuestaId! },
    });
    expect(apuesta).toMatchObject({ enVivo: true, usuarioId });
    expect(apuesta.cuotaTotal.toFixed(2)).toBe('1.80');
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('90.00');
  });

  it('un gol durante el retardo la rechaza sin descuento', async () => {
    const { usuarioId, partido, si } = await escenario();

    const { solicitudId } = (await apostar(usuarioId, si.id, '1.80').expect(202))
      .body as SolicitudVivoAceptadaDto;
    await http()
      .post(`/api/operador/partidos/${partido.id}/marcador`)
      .set(OPERADOR)
      .send({ golesLocal: 1, golesVisitante: 1, minuto: 31 })
      .expect(200);

    expect(await esperarResolucion(usuarioId, solicitudId)).toMatchObject({
      estado: 'RECHAZADA',
      apuestaId: null,
      motivoRechazo: 'MARCADOR_CAMBIO',
    });
    await sinApuestaNiDescuento(usuarioId);
  });

  it('un cambio de cuota durante el retardo la rechaza', async () => {
    const { usuarioId, si } = await escenario();

    const { solicitudId } = (await apostar(usuarioId, si.id, '1.80').expect(202))
      .body as SolicitudVivoAceptadaDto;
    await http()
      .put(`/api/operador/selecciones/${si.id}/cuota`)
      .set(OPERADOR)
      .send({ cuota: '1.60' })
      .expect(200);

    expect(await esperarResolucion(usuarioId, solicitudId)).toMatchObject({
      estado: 'RECHAZADA',
      motivoRechazo: 'CUOTA_CAMBIADA',
    });
    await sinApuestaNiDescuento(usuarioId);
  });

  it('suspender el mercado durante el retardo la rechaza', async () => {
    const { usuarioId, mercadoVivoId, si } = await escenario();

    const { solicitudId } = (await apostar(usuarioId, si.id, '1.80').expect(202))
      .body as SolicitudVivoAceptadaDto;
    await http()
      .post(`/api/operador/mercados/${mercadoVivoId}/suspender`)
      .set(OPERADOR)
      .send({ motivo: 'jugada en revisión' })
      .expect(200);

    expect(await esperarResolucion(usuarioId, solicitudId)).toMatchObject({
      estado: 'RECHAZADA',
      motivoRechazo: 'MERCADO_CERRADO',
    });
    await sinApuestaNiDescuento(usuarioId);
  });

  it('un mercado sin vivo está cerrado desde el inicio: se rechaza de inmediato', async () => {
    const { usuarioId, local } = await escenario();

    const respuesta = await apostar(usuarioId, local.id, '2.10').expect(422);
    expect(respuesta.body.codigo).toBe('MERCADO_CERRADO');
  });

  it('sin saldo suficiente se rechaza de inmediato, sin esperar el retardo', async () => {
    const { usuarioId, si } = await escenario('5.00');

    const respuesta = await apostar(usuarioId, si.id, '1.80').expect(422);
    expect(respuesta.body).toMatchObject({ codigo: 'SALDO_INSUFICIENTE', saldoDisponible: '5.00' });
  });

  it('reenviar la misma solicitud devuelve la misma espera y acepta una sola apuesta', async () => {
    const { usuarioId, si } = await escenario();
    const clave = randomUUID();

    const primera = (await apostar(usuarioId, si.id, '1.80', clave).expect(202))
      .body as SolicitudVivoAceptadaDto;
    const segunda = (await apostar(usuarioId, si.id, '1.80', clave).expect(202))
      .body as SolicitudVivoAceptadaDto;

    expect(segunda.solicitudId).toBe(primera.solicitudId);
    expect((await esperarResolucion(usuarioId, primera.solicitudId)).estado).toBe('ACEPTADA');
    expect(await ctx.prisma.apuesta.count({ where: { usuarioId } })).toBe(1);
    expect((await ctx.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('90.00');
  });

  it('cada apostador solo ve sus propias solicitudes en vivo (404)', async () => {
    const { usuarioId, si } = await escenario();
    const { solicitudId } = (await apostar(usuarioId, si.id, '1.80').expect(202))
      .body as SolicitudVivoAceptadaDto;

    await http()
      .get(`/api/apuestas/solicitudes-vivo/${solicitudId}`)
      .set(comoUsuario('otro-apostador'))
      .expect(404);
  });
});
