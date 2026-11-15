import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { ConsumoProveedorDto } from '@apuestas/shared';
import request from 'supertest';
import {
  SincronizacionProcessor,
  TRABAJOS,
} from '../src/sincronizacion/sincronizacion.processor.js';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';

const CLAVE = 'clave-de-prueba-no-real';
const PRESUPUESTO = 5;
const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const FIXTURES = join(import.meta.dirname, '../src/sincronizacion/__fixtures__');
const leer = (nombre: string) => readFileSync(join(FIXTURES, nombre), 'utf8');

/** Proveedor HTTP falso: cuenta las peticiones y responde con las respuestas grabadas. */
class ProveedorFalso {
  peticiones: URL[] = [];
  clavesRecibidas: Array<string | undefined> = [];
  fallar = false;
  restantes: string | null = null;
  enVivo: unknown[] = [];
  private servidor?: Server;

  async iniciar(): Promise<string> {
    this.servidor = createServer((req, res) => this.responder(req, res));
    await new Promise<void>((listo) => this.servidor!.listen(0, '127.0.0.1', listo));
    return `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
  }

  detener(): Promise<void> {
    return new Promise((listo) => this.servidor?.close(() => listo()));
  }

  private responder(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://local');
    this.peticiones.push(url);
    this.clavesRecibidas.push(req.headers['x-apisports-key'] as string | undefined);
    if (this.fallar) {
      res.writeHead(500).end('{}');
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/json',
      ...(this.restantes === null ? {} : { 'x-ratelimit-requests-remaining': this.restantes }),
    });
    if (url.pathname === '/odds') {
      res.end(leer('odds.json'));
    } else if (url.searchParams.has('live')) {
      res.end(JSON.stringify({ errors: [], response: this.enVivo }));
    } else {
      res.end(leer('fixtures-dia.json'));
    }
  }
}

// HU5 contra un proveedor HTTP falso: presupuesto que nunca se supera, idempotencia y tolerancia a fallas.
describe('HU5: importación con presupuesto diario (e2e)', () => {
  const entornoOriginal = { ...process.env };
  const proveedor = new ProveedorFalso();
  let ctx: AppPrueba;
  let sincronizacion: SincronizacionProcessor;

  beforeAll(async () => {
    const url = await proveedor.iniciar();
    Object.assign(process.env, {
      API_FOOTBALL_SIMULACION: 'false',
      API_FOOTBALL_KEY: CLAVE,
      API_FOOTBALL_LIGAS: '39',
      API_FOOTBALL_BASE_URL: url,
      API_FOOTBALL_PRESUPUESTO_DIARIO: String(PRESUPUESTO),
    });
    ctx = await crearAppPrueba();
    sincronizacion = ctx.app.get(SincronizacionProcessor);
  });

  afterAll(async () => {
    await ctx.app.close();
    await proveedor.detener();
    process.env = entornoOriginal;
  });

  beforeEach(async () => {
    await ctx.limpiar();
    proveedor.peticiones = [];
    proveedor.clavesRecibidas = [];
    proveedor.fallar = false;
    proveedor.restantes = null;
    proveedor.enVivo = [];
  });

  it('importa los partidos del día de las ligas configuradas sin duplicarlos', async () => {
    const primera = await sincronizacion.cicloDelDia('2026-11-15');
    const segunda = await sincronizacion.cicloDelDia('2026-11-15');

    expect(primera).toEqual({ creados: 3, actualizados: 0, omitidos: 0 });
    expect(segunda).toEqual({ creados: 0, actualizados: 3, omitidos: 0 });
    expect(await ctx.prisma.partido.count()).toBe(3);
    expect(await ctx.prisma.competicion.count()).toBe(1);
    const conProrroga = await ctx.prisma.partido.findUniqueOrThrow({
      where: { idProveedor: 1003 },
    });
    expect(conProrroga).toMatchObject({ estado: 'FINALIZADO', golesLocal: 1, golesVisitante: 1 });
  });

  it('envía la clave solo en la cabecera, nunca en la URL', async () => {
    await sincronizacion.cicloDelDia('2026-11-15');

    expect(proveedor.clavesRecibidas).toEqual([CLAVE]);
    expect(proveedor.peticiones[0]!.toString()).not.toContain(CLAVE);
  });

  it('con presupuesto 5 ningún número de ciclos lo supera y avisa que está agotado', async () => {
    for (let i = 0; i < 12; i += 1) {
      await sincronizacion.process({ name: TRABAJOS.partidosDelDia } as never);
    }

    // 5 de presupuesto - 1 de reserva (10 % redondeado arriba) = 4 consultas normales.
    expect(proveedor.peticiones).toHaveLength(4);
    const consumo = (
      await request(ctx.app.getHttpServer())
        .get('/api/operador/proveedor/consumo')
        .set(OPERADOR)
        .expect(200)
    ).body as ConsumoProveedorDto;
    expect(consumo).toMatchObject({ consultas: 4, limite: PRESUPUESTO, agotado: true });
    const copia = await ctx.prisma.consumoProveedor.findFirstOrThrow();
    expect(copia).toMatchObject({ consultas: 4, limite: PRESUPUESTO });
  });

  it('si el proveedor informa menos consultas restantes, manda su cabecera', async () => {
    proveedor.restantes = '1';

    await sincronizacion.process({ name: TRABAJOS.partidosDelDia } as never);
    await sincronizacion.process({ name: TRABAJOS.partidosDelDia } as never);

    // 5 - 1 restante = 4 consumidas: ya no queda cupo normal y la segunda no se hace.
    expect(proveedor.peticiones).toHaveLength(1);
    const consumo = (
      await request(ctx.app.getHttpServer()).get('/api/operador/proveedor/consumo').set(OPERADOR)
    ).body as ConsumoProveedorDto;
    expect(consumo).toMatchObject({ consultas: 4, agotado: true });
  });

  it('si el proveedor falla, el ciclo no se cae ni reintenta de inmediato', async () => {
    proveedor.fallar = true;

    await expect(
      sincronizacion.process({ name: TRABAJOS.partidosDelDia } as never),
    ).resolves.toBeUndefined();

    expect(proveedor.peticiones).toHaveLength(1);
    expect(await ctx.prisma.partido.count()).toBe(0);
  });

  it('importa las cuotas pre-partido y no pisa las que cambió el operador', async () => {
    await sincronizacion.cicloDelDia('2026-11-15');
    expect(await sincronizacion.cicloCuotas('2026-11-15')).toBe(4);

    const partido = await ctx.prisma.partido.findUniqueOrThrow({
      where: { idProveedor: 1001 },
      include: { mercados: { include: { selecciones: true } } },
    });
    expect(partido.mercados).toHaveLength(4);
    const local = partido.mercados
      .find((m) => m.tipo === 'RESULTADO_FINAL')!
      .selecciones.find((s) => s.codigo === 'LOCAL')!;
    await request(ctx.app.getHttpServer())
      .put(`/api/operador/selecciones/${local.id}/cuota`)
      .set(OPERADOR)
      .send({ cuota: '2.50' })
      .expect(200);

    await sincronizacion.cicloCuotas('2026-11-15');

    const despues = await ctx.prisma.seleccion.findUniqueOrThrow({ where: { id: local.id } });
    expect(despues.cuota.toFixed(2)).toBe('2.50');
    expect(await ctx.prisma.mercado.count({ where: { partidoId: partido.id } })).toBe(4);
  });

  it('en vivo consulta el resultado final de los partidos que dejaron de estar en vivo', async () => {
    await sincronizacion.cicloDelDia('2026-11-15');
    proveedor.peticiones = [];
    proveedor.enVivo = [];

    await sincronizacion.cicloVivo(Date.now());

    // Una consulta de vivo (vacía) y una por id para el partido 1002 que estaba en vivo.
    expect(proveedor.peticiones.map((u) => [...u.searchParams.keys()][0])).toEqual(['live', 'ids']);
  });

  it('la ruta de simulación no existe con el proveedor real (404)', async () => {
    const partido = await ctx.prisma.partido.findFirst();
    await request(ctx.app.getHttpServer())
      .post(
        `/api/operador/simulacion/partidos/${partido?.id ?? '00000000-0000-4000-8000-000000000000'}/eventos`,
      )
      .set(OPERADOR)
      .send({ tipo: 'INICIO' })
      .expect(404);
  });
});
