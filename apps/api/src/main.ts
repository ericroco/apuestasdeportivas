import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ENTORNO, ErrorConfiguracion, type Entorno, validarEntorno } from './config/env.js';
import { configurarApp } from './configurar-app.js';

const logger = new Logger('Arranque');

async function bootstrap(): Promise<void> {
  // En local se lee apps/api/.env; en CI y Render las variables vienen del entorno.
  if (existsSync('.env')) process.loadEnvFile('.env');

  try {
    validarEntorno(process.env);
  } catch (error) {
    if (error instanceof ErrorConfiguracion) {
      logger.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create(AppModule);
  const entorno = app.get<Entorno>(ENTORNO);
  configurarApp(app, entorno);
  await app.listen(entorno.PORT);
  logger.log(`API escuchando en el puerto ${entorno.PORT}`);
}

await bootstrap();
