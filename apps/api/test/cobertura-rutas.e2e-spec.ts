import { randomUUID } from 'node:crypto';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ES_PUBLICO } from '../src/contracts/autenticacion.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';

/**
 * Rutas que pueden responder sin sesión (FR-024). Agregar una ruta aquí es una decisión de seguridad: va en el PR
 * con revisión. Formato "MÉTODO /ruta" tal como la declara el controlador (con el prefijo /api).
 */
const RUTAS_PUBLICAS = new Set<string>([
  'GET /health',
  'POST /api/identidad/registro',
  'POST /api/identidad/correo/verificar',
]);

interface Ruta {
  readonly metodo: string;
  readonly ruta: string;
  readonly publica: boolean;
}

function rutasRegistradas(app: NestExpressApplication): Ruta[] {
  const descubrimiento = app.get(DiscoveryService);
  const escaner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const rutas: Ruta[] = [];

  for (const { instance, metatype } of descubrimiento.getControllers()) {
    if (!instance || !metatype) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '').replace(/^\/|\/$/g, '');
    const prototipo = Object.getPrototypeOf(instance) as object;
    for (const nombre of escaner.getAllMethodNames(prototipo)) {
      const manejador = (prototipo as Record<string, unknown>)[nombre] as (
        ...argumentos: unknown[]
      ) => unknown;
      const sub = Reflect.getMetadata(PATH_METADATA, manejador) as string | undefined;
      if (sub === undefined) continue;
      const metodo = RequestMethod[Reflect.getMetadata(METHOD_METADATA, manejador) as number];
      const partes = [base, sub.replace(/^\/|\/$/g, '')].filter(Boolean).join('/');
      const prefijo = base === 'health' ? '' : '/api';
      const publica = Boolean(reflector.getAllAndOverride(ES_PUBLICO, [manejador, metatype]));
      rutas.push({ metodo, ruta: `${prefijo}/${partes}`, publica });
    }
  }
  return rutas;
}

// Vector "escalada de rol" y denegación por defecto (principio I): ninguna ruta de ningún spec responde sin sesión,
// salvo las de la lista blanca. Una ruta nueva sin protección, o marcada pública por error, rompe CI.
describe('Cobertura de autenticación en todas las rutas (e2e)', () => {
  let app: NestExpressApplication;
  let rutas: Ruta[];

  beforeAll(async () => {
    app = await crearAppDePrueba();
    rutas = rutasRegistradas(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('encuentra las rutas de la app', () => {
    expect(rutas.length).toBeGreaterThan(0);
  });

  it('solo las rutas de la lista blanca están marcadas como públicas', () => {
    const publicas = rutas.filter((r) => r.publica).map((r) => `${r.metodo} ${r.ruta}`);

    expect(publicas.filter((ruta) => !RUTAS_PUBLICAS.has(ruta))).toEqual([]);
  });

  it('toda ruta no pública responde 401 sin sesión', async () => {
    const sinProteger: string[] = [];
    for (const { metodo, ruta, publica } of rutas) {
      if (publica) continue;
      const url = ruta.replace(/:[^/]+/g, randomUUID());
      const verbo = metodo.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
      const respuesta = await request(app.getHttpServer())[verbo](url).send({});
      if (respuesta.status !== 401) sinProteger.push(`${metodo} ${ruta} → ${respuesta.status}`);
    }

    expect(sinProteger).toEqual([]);
  });
});
