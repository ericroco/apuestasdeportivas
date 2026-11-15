import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

// E2E de la web.
// - Spec 1 (estado.spec.ts): levanta API, reportes y web (ya compiladas) y revisa la página de estado.
//   Requiere PostgreSQL y Redis arriba (docker compose en local, servicios del job en CI).
// - Spec 4 (spec4.spec.ts): una segunda instancia de la web habla con la API y reportes simulados
//   (e2e/simulado), porque el login del Spec 2 todavía no existe. Con E2E_SOLO_SIMULADO=1 corre solo esta.
const PUERTO_WEB = Number(process.env.E2E_WEB_PORT ?? 3000);
const PUERTO_WEB_SPEC4 = Number(process.env.E2E_WEB_SPEC4_PORT ?? 3005);
const PUERTO_API_SIMULADA = Number(process.env.E2E_API_SIMULADA_PORT ?? 4010);
const PUERTO_REPORTES_SIMULADO = Number(process.env.E2E_REPORTES_SIMULADO_PORT ?? 4011);
const EN_CI = Boolean(process.env.CI);
const SOLO_SIMULADO = Boolean(process.env.E2E_SOLO_SIMULADO);

const ESCRITORIO = devices['Desktop Chrome'];
// Constitución, principio VII: usable desde 360 px.
const MOVIL_360 = { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } };
const PRUEBAS_SPEC4 = /spec4\.spec\.ts/;

/** Entorno del proceso con valores definidos, para pasarlo completo a un servidor con cambios. */
function entornoCon(cambios: Record<string, string>): Record<string, string> {
  const actual = Object.entries(process.env).filter(
    (entrada): entrada is [string, string] => entrada[1] !== undefined,
  );
  return { ...Object.fromEntries(actual), ...cambios };
}

type Servidor = NonNullable<Exclude<PlaywrightTestConfig['webServer'], unknown[]>>;

const SERVIDORES_SPEC1: Servidor[] = [
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
];

const SERVIDORES_SPEC4: Servidor[] = [
  {
    command: 'node e2e/simulado/servidor.mjs',
    url: `http://127.0.0.1:${PUERTO_API_SIMULADA}/health`,
    env: entornoCon({
      E2E_API_SIMULADA_PORT: String(PUERTO_API_SIMULADA),
      E2E_REPORTES_SIMULADO_PORT: String(PUERTO_REPORTES_SIMULADO),
    }),
    reuseExistingServer: false,
    timeout: 30_000,
  },
  {
    command: `pnpm exec next start --port ${PUERTO_WEB_SPEC4}`,
    url: `http://localhost:${PUERTO_WEB_SPEC4}`,
    // Las variables del proceso prevalecen sobre .env.local: esta web apunta a los simulados.
    env: entornoCon({
      API_URL: `http://127.0.0.1:${PUERTO_API_SIMULADA}`,
      REPORTS_URL: `http://127.0.0.1:${PUERTO_REPORTES_SIMULADO}`,
    }),
    reuseExistingServer: false,
    timeout: 60_000,
  },
];

const PROYECTOS_SPEC1 = [
  { name: 'escritorio', testIgnore: PRUEBAS_SPEC4, use: ESCRITORIO },
  { name: 'movil-360', testIgnore: PRUEBAS_SPEC4, use: MOVIL_360 },
];

const URL_SPEC4 = `http://localhost:${PUERTO_WEB_SPEC4}`;
const PROYECTOS_SPEC4 = [
  {
    name: 'spec4-escritorio',
    testMatch: PRUEBAS_SPEC4,
    use: { ...ESCRITORIO, baseURL: URL_SPEC4 },
  },
  { name: 'spec4-movil-360', testMatch: PRUEBAS_SPEC4, use: { ...MOVIL_360, baseURL: URL_SPEC4 } },
];

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
  projects: SOLO_SIMULADO ? PROYECTOS_SPEC4 : [...PROYECTOS_SPEC1, ...PROYECTOS_SPEC4],
  webServer: SOLO_SIMULADO ? SERVIDORES_SPEC4 : [...SERVIDORES_SPEC1, ...SERVIDORES_SPEC4],
});
