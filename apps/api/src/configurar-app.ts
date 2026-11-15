import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ErrorNegocioFilter } from './comun/error-negocio.filter.js';
import { crearPipeDeValidacion } from './comun/validacion.js';
import type { Entorno } from './config/env.js';

/**
 * Configuración HTTP común a main.ts y a las pruebas e2e, para que las pruebas
 * verifiquen exactamente lo que corre en producción.
 */
export function configurarApp(app: NestExpressApplication, entorno: Entorno): void {
  // Sin esto, detrás del proxy de Render todos los clientes comparten una IP y el rate limiting no es por cliente.
  if (entorno.TRUST_PROXY_HOPS > 0) app.set('trust proxy', entorno.TRUST_PROXY_HOPS);
  app.use(helmet());
  // Con una lista, la cabecera Access-Control-Allow-Origin solo se envía al origen permitido.
  app.enableCors({ origin: [entorno.WEB_ORIGIN], credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  // Errores de negocio con `codigo` estable y validación zod de `{ schema }` (400 DATOS_INVALIDOS).
  app.useGlobalFilters(new ErrorNegocioFilter());
  app.useGlobalPipes(crearPipeDeValidacion());
  app.enableShutdownHooks();
}
