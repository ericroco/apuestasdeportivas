import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Pruebas de integración contra PostgreSQL y Redis reales. Toman las variables de .env
// (local) o del entorno del job (CI); las del entorno tienen prioridad.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: { ...loadEnv('test', process.cwd(), ''), NODE_ENV: 'test' },
    fileParallelism: false,
    passWithNoTests: true,
    // SonarQube suma esta cobertura a la de las pruebas unitarias (sonar-project.properties).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage/integracion',
    },
  },
});
