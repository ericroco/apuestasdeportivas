import type { PartidoDetalleDto } from '@apuestas/shared';
import request from 'supertest';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados } from './utilidades/fabricas.js';

const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const APOSTADOR = comoUsuario('apostador-1');

// HU5: con API_FOOTBALL_SIMULACION=true (valor por defecto) el operador simula un partido completo y cada
// evento pasa por aplicarActualizacion, el mismo camino que un dato del proveedor (FR-013).
describe('HU5: modo simulación (e2e)', () => {
  const entornoOriginal = { ...process.env };
  let ctx: AppPrueba;
  const evento = (partidoId: string, cuerpo: Record<string, unknown>) =>
    request(ctx.app.getHttpServer())
      .post(`/api/operador/simulacion/partidos/${partidoId}/eventos`)
      .set(OPERADOR)
      .send(cuerpo);

  beforeAll(async () => {
    process.env.API_FOOTBALL_SIMULACION = 'true';
    ctx = await crearAppPrueba();
  });

  afterAll(async () => {
    await ctx.app.close();
    process.env = entornoOriginal;
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  it('simula inicio, goles y final con auditoría de origen SIMULACION', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);

    const enVivo = (await evento(partido.id, { tipo: 'INICIO' }).expect(200))
      .body as PartidoDetalleDto;
    expect(enVivo).toMatchObject({ estado: 'EN_VIVO', golesLocal: 0, golesVisitante: 0 });

    await evento(partido.id, { tipo: 'GOL', equipo: 'LOCAL', minuto: 12 }).expect(200);
    const conGoles = (
      await evento(partido.id, { tipo: 'GOL', equipo: 'VISITANTE', minuto: 40 }).expect(200)
    ).body as PartidoDetalleDto;
    expect(conGoles).toMatchObject({ golesLocal: 1, golesVisitante: 1, minuto: 40 });

    const final = (await evento(partido.id, { tipo: 'FINAL' }).expect(200))
      .body as PartidoDetalleDto;
    expect(final.estado).toBe('FINALIZADO');

    const guardado = await ctx.prisma.partido.findUniqueOrThrow({ where: { id: partido.id } });
    expect(guardado.versionResultado).toBe(1);
    const cambios = ctx.auditoria.porAccion('partido.estado_cambiado');
    expect(cambios.map((e) => e.datos?.['origen'])).toEqual(['SIMULACION', 'SIMULACION']);
    expect(cambios[0]!.actorId).toBe('operador-1');
  });

  it('respeta la máquina de estados: no se puede finalizar un partido programado', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);

    const respuesta = await evento(partido.id, { tipo: 'FINAL' }).expect(409);
    expect(respuesta.body.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('un gol sin equipo o con el partido sin empezar se rechaza', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);

    await evento(partido.id, { tipo: 'GOL' }).expect(400);
    await evento(partido.id, { tipo: 'GOL', equipo: 'LOCAL' }).expect(409);
  });

  it('simula suspensión y reanudación', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);
    await evento(partido.id, { tipo: 'INICIO' }).expect(200);

    const suspendido = (await evento(partido.id, { tipo: 'SUSPENSION' }).expect(200))
      .body as PartidoDetalleDto;
    expect(suspendido.estado).toBe('SUSPENDIDO');
    const reanudado = (await evento(partido.id, { tipo: 'REANUDACION' }).expect(200))
      .body as PartidoDetalleDto;
    expect(reanudado.estado).toBe('EN_VIVO');
  });

  it('un apostador no puede simular eventos (403)', async () => {
    const partido = await crearPartidoConMercados(ctx.prisma);

    await request(ctx.app.getHttpServer())
      .post(`/api/operador/simulacion/partidos/${partido.id}/eventos`)
      .set(APOSTADOR)
      .send({ tipo: 'INICIO' })
      .expect(403);
  });
});
