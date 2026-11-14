import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENTORNO, type Entorno } from '../config/env.js';
import { REDIS } from './redis.constants.js';

const TIMEOUT_CONEXION_MS = 2_000;

function crearClienteRedis(entorno: Entorno): Redis {
  const logger = new Logger('Redis');
  const cliente = new Redis(entorno.REDIS_URL, {
    connectTimeout: TIMEOUT_CONEXION_MS,
    // Con Redis caído, cada comando se rechaza tras un reintento en lugar de acumularse.
    maxRetriesPerRequest: 1,
  });
  let desconectado = false;
  // Se registra solo el cambio de estado para no llenar el log con cada reintento.
  cliente.on('error', (error: Error) => {
    if (!desconectado) logger.error(`Redis no disponible: ${error.message}`);
    desconectado = true;
  });
  cliente.on('ready', () => {
    if (desconectado) logger.log('Redis disponible de nuevo');
    desconectado = false;
  });
  return cliente;
}

@Global()
@Module({
  providers: [{ provide: REDIS, inject: [ENTORNO], useFactory: crearClienteRedis }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
