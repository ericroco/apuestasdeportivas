import { defineConfig } from 'vitest/config';

// Pruebas unitarias: no tocan PostgreSQL ni Redis.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
