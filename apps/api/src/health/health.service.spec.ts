import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.constants.js';
import { HealthService, TIMEOUT_DEPENDENCIA_MS } from './health.service.js';

function crearServicio(dobles: { consultarBd: () => Promise<unknown>; pingRedis: () => Promise<unknown> }) {
  return Test.createTestingModule({
    providers: [
      HealthService,
      { provide: PrismaService, useValue: { $queryRaw: vi.fn(dobles.consultarBd) } },
      { provide: REDIS, useValue: { ping: vi.fn(dobles.pingRedis) } },
    ],
  })
    .compile()
    .then((modulo) => modulo.get(HealthService));
}

const responde = () => Promise.resolve('ok');
const falla = () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432 usuario=apuestas'));
const nuncaResponde = () => new Promise(() => undefined);

describe('HealthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('informa ok cuando la base de datos y la caché responden', async () => {
    const servicio = await crearServicio({ consultarBd: responde, pingRedis: responde });

    const salud = await servicio.comprobar();

    expect(salud.estado).toBe('ok');
    expect(salud.servicio).toBe('api');
    expect(salud.dependencias.baseDeDatos?.estado).toBe('ok');
    expect(salud.dependencias.cache?.estado).toBe('ok');
    expect(salud.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(new Date(salud.fecha).toISOString()).toBe(salud.fecha);
  });

  it('informa error y nombra la base de datos cuando no responde', async () => {
    const servicio = await crearServicio({ consultarBd: falla, pingRedis: responde });

    const salud = await servicio.comprobar();

    expect(salud.estado).toBe('error');
    expect(salud.dependencias.baseDeDatos?.estado).toBe('error');
    expect(salud.dependencias.cache?.estado).toBe('ok');
  });

  it('informa error y nombra la caché cuando Redis no responde', async () => {
    const servicio = await crearServicio({ consultarBd: responde, pingRedis: falla });

    const salud = await servicio.comprobar();

    expect(salud.estado).toBe('error');
    expect(salud.dependencias.cache?.estado).toBe('error');
  });

  it('cuenta como error una dependencia que no responde dentro del timeout', async () => {
    vi.useFakeTimers();
    const servicio = await crearServicio({ consultarBd: nuncaResponde, pingRedis: responde });

    const pendiente = servicio.comprobar();
    await vi.advanceTimersByTimeAsync(TIMEOUT_DEPENDENCIA_MS);
    const salud = await pendiente;

    expect(salud.dependencias.baseDeDatos).toEqual({ estado: 'error', latenciaMs: TIMEOUT_DEPENDENCIA_MS });
  });

  it('no expone mensajes de error, hosts ni usuarios en la respuesta', async () => {
    const servicio = await crearServicio({ consultarBd: falla, pingRedis: falla });

    const salud = await servicio.comprobar();

    expect(JSON.stringify(salud)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|usuario/);
  });
});
