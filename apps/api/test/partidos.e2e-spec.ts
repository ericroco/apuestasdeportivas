import type { Pagina, PartidoDetalleDto, PartidoResumenDto } from '@apuestas/shared';
import request from 'supertest';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearCompeticion, crearPartidoConMercados } from './utilidades/fabricas.js';

const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const ADMIN = comoUsuario('admin-1', 'ADMINISTRADOR');
const APOSTADOR = comoUsuario('apostador-1');
const enUnaHora = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

// HU1: el operador gestiona partidos, mercados y cuotas; el apostador ve la cartelera y el detalle.
describe('HU1: partidos, mercados y cartelera (e2e)', () => {
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

  async function crearPartidoPorApi(): Promise<PartidoDetalleDto> {
    const competicion = await http()
      .post('/api/operador/competiciones')
      .set(OPERADOR)
      .send({ nombre: 'LigaPro', pais: 'Ecuador' })
      .expect(201);
    const partido = await http()
      .post('/api/operador/partidos')
      .set(OPERADOR)
      .send({
        competicionId: competicion.body.id,
        nombreLocal: 'Barcelona SC',
        nombreVisitante: 'Emelec',
        inicioEn: enUnaHora(),
      })
      .expect(201);
    return partido.body as PartidoDetalleDto;
  }

  async function agregarMercado1x2(partidoId: string): Promise<PartidoDetalleDto> {
    const respuesta = await http()
      .post(`/api/operador/partidos/${partidoId}/mercados`)
      .set(OPERADOR)
      .send({
        tipo: 'RESULTADO_FINAL',
        admiteVivo: false,
        selecciones: [
          { codigo: 'LOCAL', cuota: '2.10' },
          { codigo: 'EMPATE', cuota: '3.20' },
          { codigo: 'VISITANTE', cuota: '3.50' },
        ],
      })
      .expect(201);
    return respuesta.body as PartidoDetalleDto;
  }

  const cambiarEstado = (partidoId: string, cuerpo: Record<string, unknown>) =>
    http().post(`/api/operador/partidos/${partidoId}/estado`).set(OPERADOR).send(cuerpo);

  it('el operador crea un partido programado que aparece en la cartelera', async () => {
    const partido = await crearPartidoPorApi();

    expect(partido.estado).toBe('PROGRAMADO');
    const cartelera = await http().get('/api/partidos').set(APOSTADOR).expect(200);
    const pagina = cartelera.body as Pagina<PartidoResumenDto>;
    expect(pagina.elementos.map((p) => p.id)).toContain(partido.id);
    expect(pagina).toMatchObject({ pagina: 1, total: 1 });
    expect(ctx.auditoria.porAccion('partido.creado')).toHaveLength(1);
  });

  it('el mercado aparece en el detalle con sus cuotas como texto decimal', async () => {
    const partido = await crearPartidoPorApi();
    await agregarMercado1x2(partido.id);

    const detalle = await http().get(`/api/partidos/${partido.id}`).set(APOSTADOR).expect(200);
    const mercado = (detalle.body as PartidoDetalleDto).mercados[0]!;

    expect(mercado).toMatchObject({ tipo: 'RESULTADO_FINAL', estado: 'ABIERTO', linea: null });
    expect(mercado.selecciones.map((s) => [s.codigo, s.cuota])).toEqual(
      expect.arrayContaining([
        ['LOCAL', '2.10'],
        ['EMPATE', '3.20'],
        ['VISITANTE', '3.50'],
      ]),
    );
    expect(ctx.auditoria.porAccion('mercado.creado')).toHaveLength(1);
  });

  it('rechaza un mercado con selecciones incompletas (400)', async () => {
    const partido = await crearPartidoPorApi();

    await http()
      .post(`/api/operador/partidos/${partido.id}/mercados`)
      .set(OPERADOR)
      .send({
        tipo: 'AMBOS_MARCAN',
        admiteVivo: false,
        selecciones: [{ codigo: 'SI', cuota: '1.80' }],
      })
      .expect(400);
  });

  it('cambiar una cuota la actualiza, guarda historial, sube la versión y queda auditado', async () => {
    const partido = await crearPartidoPorApi();
    const conMercado = await agregarMercado1x2(partido.id);
    const local = conMercado.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;

    await http()
      .put(`/api/operador/selecciones/${local.id}/cuota`)
      .set(OPERADOR)
      .send({ cuota: '2.40' })
      .expect(200);

    const detalle = (await http().get(`/api/partidos/${partido.id}`).set(APOSTADOR))
      .body as PartidoDetalleDto;
    expect(detalle.mercados[0]!.selecciones.find((s) => s.id === local.id)!.cuota).toBe('2.40');
    expect(detalle.version).toBeGreaterThan(conMercado.version);

    const historial = await ctx.prisma.historialCuota.findMany({
      where: { seleccionId: local.id },
      orderBy: { creadoEn: 'asc' },
    });
    expect(
      historial.map((h) => [h.cuotaAnterior?.toFixed(2) ?? null, h.cuotaNueva.toFixed(2)]),
    ).toEqual([
      [null, '2.10'],
      ['2.10', '2.40'],
    ]);
    expect(historial[1]!.actorId).toBe('operador-1');

    const mercado = await ctx.prisma.mercado.findFirstOrThrow({ where: { partidoId: partido.id } });
    expect(mercado.gestionadoPorOperador).toBe(true);
    expect(ctx.auditoria.porAccion('cuota.cambiada')[0]).toMatchObject({
      actorId: 'operador-1',
      entidadId: local.id,
      datos: { cuotaAnterior: '2.10', cuotaNueva: '2.40' },
    });
  });

  it('rechaza cambiar la cuota a 1.00 o menos (400)', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);
    const seleccion = partido.mercados[0]!.selecciones[0]!;

    await http()
      .put(`/api/operador/selecciones/${seleccion.id}/cuota`)
      .set(OPERADOR)
      .send({ cuota: '1.00' })
      .expect(400);
  });

  it('un apostador no puede crear partidos ni cambiar cuotas (403)', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);
    const seleccion = partido.mercados[0]!.selecciones[0]!;

    await http()
      .post('/api/operador/partidos')
      .set(APOSTADOR)
      .send({
        competicionId: partido.competicionId,
        nombreLocal: 'A',
        nombreVisitante: 'B',
        inicioEn: enUnaHora(),
      })
      .expect(403);
    await http()
      .put(`/api/operador/selecciones/${seleccion.id}/cuota`)
      .set(APOSTADOR)
      .send({ cuota: '5.00' })
      .expect(403);
  });

  it('sin sesión no se puede ver la cartelera (401)', async () => {
    await http().get('/api/partidos').expect(401);
  });

  it('el administrador también gestiona partidos', async () => {
    const competicion = await crearCompeticion(ctx.prisma);

    await http()
      .post('/api/operador/partidos')
      .set(ADMIN)
      .send({
        competicionId: competicion.id,
        nombreLocal: 'A',
        nombreVisitante: 'B',
        inicioEn: enUnaHora(),
      })
      .expect(201);
  });

  it('rechaza un partido con hora pasada, equipos iguales o campos extra (400)', async () => {
    const competicion = await crearCompeticion(ctx.prisma);
    const base = { competicionId: competicion.id, nombreLocal: 'A', nombreVisitante: 'B' };
    const crear = (cuerpo: Record<string, unknown>) =>
      http().post('/api/operador/partidos').set(OPERADOR).send(cuerpo);

    await crear({ ...base, inicioEn: new Date(Date.now() - 60_000).toISOString() }).expect(400);
    await crear({ ...base, nombreVisitante: 'A', inicioEn: enUnaHora() }).expect(400);
    await crear({ ...base, inicioEn: enUnaHora(), estado: 'FINALIZADO' }).expect(400);
  });

  it('una transición inválida responde 409 TRANSICION_INVALIDA con las permitidas', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma, { estado: 'FINALIZADO' });

    const respuesta = await cambiarEstado(partido.id, {
      estado: 'PROGRAMADO',
      motivo: 'error de carga',
    }).expect(409);

    expect(respuesta.body).toMatchObject({ codigo: 'TRANSICION_INVALIDA', permitidas: [] });
  });

  it('al pasar a en vivo cierra los mercados que no admiten vivo y audita el cambio', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma, {
      mercados: [
        {},
        { tipo: 'AMBOS_MARCAN', admiteVivo: true, cuotas: { SI: '1.80', NO: '1.95' } },
      ],
    });

    await cambiarEstado(partido.id, { estado: 'EN_VIVO', motivo: 'inicio' }).expect(200);

    const mercados = await ctx.prisma.mercado.findMany({ where: { partidoId: partido.id } });
    expect(Object.fromEntries(mercados.map((m) => [m.tipo, m.estado]))).toEqual({
      RESULTADO_FINAL: 'CERRADO',
      AMBOS_MARCAN: 'ABIERTO',
    });
    expect(ctx.auditoria.porAccion('partido.estado_cambiado')[0]).toMatchObject({
      datos: { anterior: 'PROGRAMADO', nuevo: 'EN_VIVO', motivo: 'inicio' },
    });
  });

  it('al suspender guarda el marcador y suspende los mercados; al reanudar los reabre', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma, {
      estado: 'EN_VIVO',
      mercados: [{ tipo: 'AMBOS_MARCAN', admiteVivo: true, cuotas: { SI: '1.80', NO: '1.95' } }],
    });
    await http()
      .post(`/api/operador/partidos/${partido.id}/marcador`)
      .set(OPERADOR)
      .send({ golesLocal: 2, golesVisitante: 0, minuto: 30 })
      .expect(200);

    await cambiarEstado(partido.id, { estado: 'SUSPENDIDO', motivo: 'lluvia' }).expect(200);
    const suspendido = await ctx.prisma.partido.findUniqueOrThrow({
      where: { id: partido.id },
      include: { mercados: true },
    });
    expect(suspendido).toMatchObject({ golesLocalSuspension: 2, golesVisitanteSuspension: 0 });
    expect(suspendido.suspendidoEn).not.toBeNull();
    expect(suspendido.mercados[0]!.estado).toBe('SUSPENDIDO');

    await cambiarEstado(partido.id, { estado: 'EN_VIVO', motivo: 'se reanuda' }).expect(200);
    const reanudado = await ctx.prisma.mercado.findFirstOrThrow({
      where: { partidoId: partido.id },
    });
    expect(reanudado.estado).toBe('ABIERTO');
  });

  it('reprogramar un aplazado exige una nueva hora futura y conserva la original', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma, { estado: 'APLAZADO' });

    await cambiarEstado(partido.id, { estado: 'PROGRAMADO', motivo: 'nueva fecha' }).expect(400);

    const nuevaHora = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await cambiarEstado(partido.id, {
      estado: 'PROGRAMADO',
      inicioEn: nuevaHora,
      motivo: 'nueva fecha',
    }).expect(200);

    const reprogramado = await ctx.prisma.partido.findUniqueOrThrow({ where: { id: partido.id } });
    expect(reprogramado.inicioEn.toISOString()).toBe(nuevaHora);
    expect(reprogramado.inicioOriginalEn.toISOString()).toBe(
      partido.inicioOriginalEn.toISOString(),
    );
  });

  it('el marcador solo se actualiza con el partido en vivo (409)', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);

    await http()
      .post(`/api/operador/partidos/${partido.id}/marcador`)
      .set(OPERADOR)
      .send({ golesLocal: 1, golesVisitante: 0 })
      .expect(409);
  });

  it('el operador suspende y reabre un mercado con motivo y auditoría', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);
    const mercadoId = partido.mercados[0]!.id;
    const estadoMercado = async () =>
      (await ctx.prisma.mercado.findUniqueOrThrow({ where: { id: mercadoId } })).estado;

    await http()
      .post(`/api/operador/mercados/${mercadoId}/suspender`)
      .set(OPERADOR)
      .send({ motivo: 'revisión' })
      .expect(200);
    expect(await estadoMercado()).toBe('SUSPENDIDO');

    await http()
      .post(`/api/operador/mercados/${mercadoId}/reabrir`)
      .set(OPERADOR)
      .send({ motivo: 'ok' })
      .expect(200);
    expect(await estadoMercado()).toBe('ABIERTO');
    expect(ctx.auditoria.porAccion('mercado.suspendido')).toHaveLength(1);
    expect(ctx.auditoria.porAccion('mercado.reabierto')).toHaveLength(1);
  });

  it('no se puede reabrir un mercado de un partido finalizado (422 MERCADO_CERRADO)', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma, {
      estado: 'FINALIZADO',
      mercados: [{ estado: 'CERRADO' }],
    });

    const respuesta = await http()
      .post(`/api/operador/mercados/${partido.mercados[0]!.id}/reabrir`)
      .set(OPERADOR)
      .send({ motivo: 'x' })
      .expect(422);
    expect(respuesta.body.codigo).toBe('MERCADO_CERRADO');
  });

  it('la cartelera pagina, filtra por estado y excluye por defecto los terminados', async () => {
    const competicion = await crearCompeticion(ctx.prisma);
    for (let i = 0; i < 3; i += 1) {
      await crearPartidoConMercados(ctx.prisma, { competicionId: competicion.id });
    }
    await crearPartidoConMercados(ctx.prisma, {
      competicionId: competicion.id,
      estado: 'FINALIZADO',
    });

    const porDefecto = (await http().get('/api/partidos?porPagina=2').set(APOSTADOR).expect(200))
      .body as Pagina<PartidoResumenDto>;
    expect(porDefecto).toMatchObject({ total: 3, porPagina: 2 });
    expect(porDefecto.elementos).toHaveLength(2);

    const finalizados = (await http().get('/api/partidos?estado=FINALIZADO').set(APOSTADOR))
      .body as Pagina<PartidoResumenDto>;
    expect(finalizados.total).toBe(1);

    await http().get('/api/partidos?porPagina=500').set(APOSTADOR).expect(400);
  });

  it('lista las competiciones y responde 404 a un partido inexistente', async () => {
    await crearCompeticion(ctx.prisma, 'Serie A');

    const competiciones = await http().get('/api/competiciones').set(APOSTADOR).expect(200);
    expect(competiciones.body).toEqual([expect.objectContaining({ nombre: 'Serie A' })]);
    await http()
      .get('/api/partidos/00000000-0000-4000-8000-000000000000')
      .set(APOSTADOR)
      .expect(404);
  });

  it('no existen rutas para borrar partidos ni mercados (FR-007)', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);

    await http().delete(`/api/operador/partidos/${partido.id}`).set(OPERADOR).expect(404);
    await http()
      .delete(`/api/operador/mercados/${partido.mercados[0]!.id}`)
      .set(OPERADOR)
      .expect(404);
  });
});
