import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENTORNO, type Entorno } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** Tiempo máximo para abrir una conexión; mantiene la salud dentro de su presupuesto de 5 s. */
const TIMEOUT_CONEXION_MS = 2_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENTORNO) entorno: Entorno) {
    super({
      adapter: new PrismaPg({
        connectionString: entorno.DATABASE_URL,
        connectionTimeoutMillis: TIMEOUT_CONEXION_MS,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
