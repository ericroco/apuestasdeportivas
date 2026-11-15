import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { ENTORNO, type Entorno } from '../../src/config/env.js';
import { configurarApp } from '../../src/configurar-app.js';

/**
 * App real (AppModule + configurarApp, con el guard global y el throttler) para las pruebas de integración de
 * los specs 2, 3 y 4. No limpia la base: cada prueba crea sus propios datos únicos (research §17).
 * `sustituir` reemplaza proveedores externos (p. ej. `PASARELA_PORT`) por dobles de prueba.
 */
export async function crearAppDePrueba(
  opciones: {
    controladores?: Type[];
    proveedores?: Type[];
    sustituir?: { token: symbol | Type; valor: unknown }[];
  } = {},
): Promise<NestExpressApplication> {
  let constructor = Test.createTestingModule({
    imports: [AppModule],
    controllers: opciones.controladores ?? [],
    providers: opciones.proveedores ?? [],
  });
  for (const { token, valor } of opciones.sustituir ?? []) {
    constructor = constructor.overrideProvider(token).useValue(valor);
  }
  const modulo = await constructor.compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app, app.get<Entorno>(ENTORNO));
  await app.init();
  return app;
}
