import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pruebas unitarias de la web. Los componentes de servidor async se cubren con Playwright (e2e/).
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` lanza fuera de un Server Component; en las pruebas los clientes del servidor se
      // importan directamente, así que se sustituye por su versión vacía (la que usa Next en el servidor).
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/components/**'],
      exclude: ['**/*.test.{ts,tsx}'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
