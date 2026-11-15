import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Pruebas unitarias de la web. Los componentes de servidor async se cubren con Playwright (e2e/).
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
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
