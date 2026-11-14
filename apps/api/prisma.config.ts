import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no carga el .env por sí solo; en CI y Render las variables ya vienen del entorno.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
