import { randomUUID } from 'node:crypto';
import type { ApuestaDto } from '@apuestas/shared';
import request from 'supertest';
import { LiquidacionService } from '../src/liquidacion/liquidacion.service.js';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados, crearUsuarioConSaldo } from './utilidades/fabricas.js';

// HU3 (T060): procesar el mismo resultado varias veces, en paralelo o tras una caída no paga dos veces (SC-003).
describe('HU3: idempotencia de la liquidación (e2e)', () => {
  let ctx: AppPrueba;
  let liquidacion: LiquidacionService;

  beforeAll(async () => {
    ctx = await crearAppPrueba();
    liquidacion = ctx.app.get(LiquidacionService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  /** Partido con N apuestas ganadoras a LOCAL (2.10) de usuarios distintos, finalizado 1-0 sin pasar por la cola. */
  async function finalizadoConGanadoras(cantidad: number) {
    const partido = await crearPartidoConMercados(ctx.prisma);
    const local = partido.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;
    const usuarios: string[] = [];
    const apuestas: ApuestaDto[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      const usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
      usuarios.push(usuarioId);
      const respuesta = await request(ctx.app.getHttpServer())
        .post('/api/apuestas')
        .set(comoUsuario(usuarioId))
        .send({
          claveSolicitud: randomUUID(),
          monto: '10.00',
          selecciones: [{ seleccionId: local.id, cuotaVista: '2.10' }],
        })
        .expect(201);
      apuestas.push(respuesta.body as ApuestaDto);
    }
    // Directo en la base: así la cola no corre en paralelo con las llamadas de la prueba.
    await ctx.prisma.partido.update({
      where: { id: partido.id },
      data: { estado: 'FINALIZADO', golesLocal: 1, golesVisitante: 0, versionResultado: 1 },
    });
    return { partido, usuarios, apuestas };
  }

  async function saldosYPremios(usuarios: string[]) {
    return Promise.all(
      usuarios.map(async (u) => ({
        saldo: (await ctx.billetera.obtenerSaldos(u)).real.toFixed(2),
        premios: await ctx.billetera.contarAsientos(u, 'PREMIO'),
      })),
    );
  }

  it('procesar el mismo resultado 5 veces deja los saldos como procesarlo una vez', async () => {
    const { partido, usuarios } = await finalizadoConGanadoras(2);

    for (let i = 0; i < 5; i += 1) await liquidacion.liquidarPartido(partido.id, 1);

    expect(await saldosYPremios(usuarios)).toEqual([
      { saldo: '111.00', premios: 1 },
      { saldo: '111.00', premios: 1 },
    ]);
    expect(await ctx.prisma.liquidacion.count()).toBe(2);
  });

  it('5 procesamientos simultáneos tampoco pagan dos veces', async () => {
    const { partido, usuarios } = await finalizadoConGanadoras(3);

    await Promise.all(Array.from({ length: 5 }, () => liquidacion.liquidarPartido(partido.id, 1)));

    expect(
      (await saldosYPremios(usuarios)).every((u) => u.saldo === '111.00' && u.premios === 1),
    ).toBe(true);
  });

  it('si la billetera falla a mitad, el reintento completa sin perder ni duplicar pagos', async () => {
    const { partido, usuarios, apuestas } = await finalizadoConGanadoras(3);
    const original = ctx.billetera.acreditarPremio.bind(ctx.billetera);
    let llamadas = 0;
    const espia = vi.spyOn(ctx.billetera, 'acreditarPremio').mockImplementation(async (tx, op) => {
      llamadas += 1;
      if (llamadas === 3) throw new Error('billetera caída');
      return original(tx, op);
    });

    await expect(liquidacion.liquidarPartido(partido.id, 1)).rejects.toThrow('billetera caída');
    // Las dos primeras quedaron confirmadas; la tercera (la que falló) se revirtió entera.
    const estados = await ctx.prisma.apuesta.findMany({
      where: { id: { in: apuestas.map((a) => a.id) } },
      select: { estado: true },
    });
    expect(estados.map((e) => e.estado).sort()).toEqual(['GANADA', 'GANADA', 'PENDIENTE']);

    espia.mockRestore();
    await liquidacion.liquidarPartido(partido.id, 1);

    expect(
      (await saldosYPremios(usuarios)).every((u) => u.saldo === '111.00' && u.premios === 1),
    ).toBe(true);
  });

  it('un resultado viejo (otra versión) no liquida nada', async () => {
    const { partido, usuarios } = await finalizadoConGanadoras(1);

    expect(await liquidacion.liquidarPartido(partido.id, 7)).toEqual({
      liquidadas: 0,
      pendientes: 0,
    });
    expect(await saldosYPremios(usuarios)).toEqual([{ saldo: '90.00', premios: 0 }]);
  });
});
