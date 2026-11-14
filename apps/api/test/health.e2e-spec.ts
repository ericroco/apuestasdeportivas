import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { RespuestaSalud } from '@apuestas/shared';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { ENTORNO, type Entorno } from '../src/config/env.js';

// Prueba de integración contra PostgreSQL y Redis reales (docker compose en local, servicios en CI).
describe('API: salud y seguridad base (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app, app.get<Entorno>(ENTORNO));
    await app.init();
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
