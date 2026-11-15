import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Entorno } from './config/env.js';
import { middlewareCliente } from './identidad/http/cliente-http.js';

/**
 * Configuración HTTP común a main.ts y a las pruebas e2e, para que las pruebas
 * verifiquen exactamente lo que corre en producción.
 */
export function configurarApp(app: NestExpressApplication, entorno: Entorno): void {
  // Sin esto, detrás del proxy de Render todos los clientes comparten una IP y el rate limiting no es por cliente.
  if (entorno.TRUST_PROXY_HOPS > 0) app.set('trust proxy', entorno.TRUST_PROXY_HOPS);
  app.use(helmet());
  // Spec 2: cookies de sesión (contrato 6) e IP/dispositivo reales del cliente detrás del proxy de la web.
  app.use(cookieParser());
  app.use(middlewareCliente(entorno.WEB_PROXY_SECRETO));
  // Con una lista, la cabecera Access-Control-Allow-Origin solo se envía al origen permitido.
  app.enableCors({ origin: [entorno.WEB_ORIGIN], credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableShutdownHooks();
}
