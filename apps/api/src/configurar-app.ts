import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { Entorno } from './config/env.js';

/**
 * Configuración HTTP común a main.ts y a las pruebas e2e, para que las pruebas
 * verifiquen exactamente lo que corre en producción.
 */
export function configurarApp(app: INestApplication, entorno: Entorno): void {
  app.use(helmet());
  // Con una lista, la cabecera Access-Control-Allow-Origin solo se envía al origen permitido.
  app.enableCors({ origin: [entorno.WEB_ORIGIN], credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableShutdownHooks();
}
