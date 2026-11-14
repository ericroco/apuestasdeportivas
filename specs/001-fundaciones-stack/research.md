# Research: Fundaciones del stack tecnológico

Decisiones de la fase 0 del plan. Versiones verificadas en npm y PyPI el 2026-11-14.

## 1. Versión de TypeScript

- **Decision**: TypeScript `~6.0.3`.
- **Rationale**: `typescript-eslint` 8.x declara `typescript <6.1.0` y `ts-jest` 29.x `typescript <7`. TypeScript 7
  (compilador nativo) ya es `latest`, pero romperlo con el lint y las pruebas en el primer spec no compensa.
- **Alternatives considered**: TypeScript 7.0 (incompatible hoy con el tooling); 5.9 (sin motivo para quedarse atrás).

## 2. Monorepo

- **Decision**: pnpm 11 workspaces + Turborepo 2, `packageManager` fijado en la raíz.
- **Rationale**: lo fija `PLAN.md`; Turborepo cachea `lint`, `typecheck`, `test` y `build` y respeta dependencias
  (`^build`) para que `packages/shared` se compile antes que web y API.
- **Alternatives considered**: Nx (más pesado); workspaces sin orquestador (sin caché ni orden de tareas).

## 3. ORM y migraciones

- **Decision**: Prisma 7.10 estable con `@prisma/adapter-pg`, `prisma.config.ts` y generador `prisma-client`.
- **Rationale**: lo fija `PLAN.md`; Prisma 7 ya no usa motor binario en Rust y exige adaptador de driver. El tag
  `latest` de npm apunta a una RC de Prisma 8, así que se fija la última estable.
- **Bloqueo de fila**: Prisma no expone `SELECT … FOR UPDATE` en su API; el Spec 2 lo hará con `$queryRaw` dentro de
  `$transaction`. Por eso `BilleteraPort` recibe el cliente transaccional.
- **Migraciones en paralelo**: cada spec crea sus migraciones en su rama; antes de abrir el PR se actualiza con
  `develop` y, si otra migración entró antes, se regenera la propia (`prisma migrate dev`) para mantener el orden.

## 4. Comprobaciones de salud

- **Decision**: endpoint propio `GET /health` (sin `@nestjs/terminus`) que hace `SELECT 1` en PostgreSQL y `PING` en
  Redis, cada uno con timeout de 2 s, y responde 200 `ok` o 503 `error` con el estado por dependencia.
- **Rationale**: dos comprobaciones no justifican una dependencia más; el formato queda en el contrato
  `contracts/salud.openapi.yaml` y en `packages/shared`, y la web lo consume tipado.
- **Alternatives considered**: `@nestjs/terminus` (formato propio más verboso, más superficie).

## 5. Seguridad base de la API

- **Decision**: `helmet`, CORS limitado a `WEB_ORIGIN`, `@nestjs/throttler` global (100 peticiones/min por IP por
  defecto, configurable), prefijo `/api` para las rutas de negocio y `/health` fuera del prefijo, y errores con el
  formato estándar de Nest (`statusCode`, `message`, `error`) sin trazas.
- **Validación de entrada**: NestJS 12 valida con Standard Schema; la convención del proyecto es zod con
  `StandardSchemaValidationPipe` (`@Body({ schema })`) y objetos `.strict()` para rechazar campos no declarados.
  Se documenta en `CONTRIBUTING.md`; el primer endpoint con cuerpo llega en el Spec 2.
- **Rationale**: la constitución exige rate limiting y validación en todo endpoint; montarlo en el Spec 1 evita que
  cada spec lo configure distinto.
- **Variables de entorno**: se validan con `zod` al arrancar; si falta una, la app no inicia y nombra la variable.

## 6. Servicio de reportes

- **Decision**: proyecto `uv` con FastAPI, pydantic-settings y psycopg 3; `GET /health` comprueba la BD con el usuario
  `reportes_lectura`. pandas se agrega en el Spec 4, que es quien lo usa.
- **Usuario de solo lectura**: un script de `infra/postgres/init/` crea el rol con `CONNECT`, `USAGE` y `SELECT`, más
  `ALTER DEFAULT PRIVILEGES` para que las tablas futuras del usuario de la API también sean legibles. En Render se
  ejecuta el mismo SQL una vez (documentado en `docs/despliegue.md`).
- **Calidad**: Ruff (lint + formato) y mypy en modo estricto; pytest con cobertura.

## 7. Pruebas y lint de TypeScript

- **Decision**: Vitest para unidades e integración en API y web (con Testing Library en web), Playwright para E2E;
  Oxlint en la API y ESLint (`eslint-config-next`) en la web.
- **Rationale**: NestJS 12 genera proyectos ESM con Vitest y Oxlint (`nest new` verificado el 2026-11-14); Jest con
  ESM exige configuración experimental. Vitest tiene la misma API (`describe`, `it`, `expect`; `vi.fn()` en lugar de
  `jest.fn()`), así que el principio de la constitución no cambia, solo el nombre de la herramienta: se enmienda a
  1.0.1. En la web, Next.js documenta Vitest y así hay un solo runner de pruebas TypeScript en el repo.
- **Componentes de servidor**: Vitest no renderiza componentes `async`; se separa la obtención de datos (función
  pura, probada con `fetch` simulado) de la presentación (componente síncrono probado con Testing Library).
- **E2E de punta a punta**: Playwright levanta API, reportes y web con `webServer` y verifica que la página de estado
  muestra los tres componentes operativos. En CI corre con PostgreSQL y Redis como servicios del job.
- **Alternatives considered**: Jest 30 con `ts-jest` en modo ESM (frágil, contra el default de Nest); ESLint también en
  la API (otra configuración que mantener sin beneficio claro frente al default).

## 8. Despliegue

- **Decision**: CI dispara el despliegue solo si la compuerta pasó: Render mediante *deploy hooks* (servicios con
  `autoDeployTrigger: off` en `render.yaml`) y Vercel mediante la CLI (`vercel deploy`, preview para `develop` y
  `--prod` para `main`). Sin secretos, el job se omite con un aviso.
- **Rationale**: cumple "lint → tipos → tests → SonarQube → deploy" con el orden garantizado por `needs`.
- **Limitación**: Render permite una sola PostgreSQL gratuita, así que `render.yaml` define staging (`develop`).
  Producción (`main`) es una réplica del blueprint con otra BD, documentada en `docs/despliegue.md`.

## 9. Análisis estático y trazabilidad

- **Decision**: SonarQube Cloud con `sonar-project.properties` (cobertura lcov de web/API y XML de reportes) y
  compuerta bloqueante (`sonar.qualitygate.wait=true`) cuando existe `SONAR_TOKEN`. Grafana Cloud con el datasource
  de GitHub según `docs/trazabilidad-grafana.md`.
- **Rationale**: ambas cuentas son externas y gratuitas para repos públicos; el repo queda listo para conectarlas sin
  que su ausencia bloquee al equipo.

## 10. Convenciones de commits y finales de línea

- **Decision**: Husky (`commit-msg`) + commitlint con `@commitlint/config-conventional`, validación también en CI
  sobre los commits del PR; `.gitattributes` con `eol=lf`.
- **Rationale**: el equipo trabaja en Windows (`core.autocrlf=true`); sin `eol=lf` Prettier y los hooks de shell
  fallan de forma intermitente.
