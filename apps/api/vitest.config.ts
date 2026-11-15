import { defineConfig } from 'vitest/config';

// Pruebas unitarias: no tocan PostgreSQL ni Redis.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    // La primera prueba de cada archivo carga el cliente de Prisma; con turbo corriendo las tres apps en paralelo y
    // cobertura, esa importación supera los 5 s por defecto aunque la prueba tarde milisegundos.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage/unit',
    },
  },
});
