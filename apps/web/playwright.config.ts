import { defineConfig, devices } from '@playwright/test';

// E2E de punta a punta del Spec 1: levanta API, reportes y web (ya compiladas) y revisa la página de estado.
// Requiere PostgreSQL y Redis arriba (docker compose en local, servicios del job en CI).
const PUERTO_WEB = Number(process.env.E2E_WEB_PORT ?? 3000);
const EN_CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: EN_CI,
  retries: EN_CI ? 1 : 0,
  reporter: EN_CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO_WEB}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    // Constitución, principio VII: usable desde 360 px.
    { name: 'movil-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } } },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !EN_CI,
      timeout: 60_000,
    },
    {
      command: 'uv run python -m reports',
      cwd: '../reports',
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: !EN_CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next start --port ${PUERTO_WEB}`,
      url: `http://localhost:${PUERTO_WEB}`,
      reuseExistingServer: !EN_CI,
      timeout: 60_000,
    },
  ],
});
