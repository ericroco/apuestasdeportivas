import { Controller, Get } from '@nestjs/common';
import { Publico } from '../src/contracts/autenticacion.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { RespuestaSalud } from '@apuestas/shared';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { ENTORNO, type Entorno } from '../src/config/env.js';

// Prueba de integración contra PostgreSQL y Redis reales (docker compose en local, servicios en CI).
async function crearApp(
  controladores: Array<new () => unknown> = [],
): Promise<NestExpressApplication> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
    controllers: controladores,
  }).compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app, app.get<Entorno>(ENTORNO));
  await app.init();
  return app;
}

describe('API: salud y seguridad base (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde 200 con la base de datos y la caché disponibles', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health').expect(200);
    const salud = respuesta.body as RespuestaSalud;

    expect(salud).toMatchObject({
      estado: 'ok',
      servicio: 'api',
      dependencias: {
        baseDeDatos: { estado: 'ok' },
        cache: { estado: 'ok' },
      },
    });
  });

  it('/health no lleva el prefijo /api', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(404);
  });

  it('responde rutas inexistentes con el formato de error uniforme y sin trazas', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/no-existe').expect(404);

    expect(respuesta.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: expect.any(String),
    });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/at .*\.(js|ts):\d+/);
  });

  it('aplica cabeceras de seguridad y oculta la tecnología del servidor', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');

    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });

  it('solo permite CORS desde el origen de la web configurado', async () => {
    const origen = app.get<Entorno>(ENTORNO).WEB_ORIGIN;

    const permitido = await request(app.getHttpServer()).get('/health').set('Origin', origen);
    const ajeno = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://sitio-ajeno.example');

    expect(permitido.headers['access-control-allow-origin']).toBe(origen);
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });
});

@Controller('prueba-limite')
class ControladorLimitado {
  // Pública: esta prueba mide el rate limiting, no la autenticación (el guard global llega con el Spec 2).
  @Get()
  @Publico()
  responder(): { ok: true } {
    return { ok: true };
  }
}

// En Render la API está detrás de un proxy: sin `trust proxy` todos los clientes comparten la IP del proxy
// y el rate limiting bloquearía a todos a la vez (FR-010: el límite es por cliente).
describe('API: rate limiting por cliente detrás del proxy (e2e)', () => {
  const entornoOriginal = { ...process.env };
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '2';
    process.env.TRUST_PROXY_HOPS = '1';
    app = await crearApp([ControladorLimitado]);
  });

  afterAll(async () => {
    await app.close();
    process.env = entornoOriginal;
  });

  it('limita a cada cliente por su IP real y no por la del proxy', async () => {
    const pedir = (ip: string) =>
      request(app.getHttpServer()).get('/api/prueba-limite').set('X-Forwarded-For', ip);

    await pedir('203.0.113.1').expect(200);
    await pedir('203.0.113.1').expect(200);
    await pedir('203.0.113.1').expect(429);
    await pedir('203.0.113.2').expect(200);
  });
});
