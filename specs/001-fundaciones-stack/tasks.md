---
description: "Lista de tareas del Spec 1: fundaciones del stack"
---

# Tasks: Fundaciones del stack tecnológico

**Input**: Design documents from `/specs/001-fundaciones-stack/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: la constitución (principio IV) exige pruebas primero y al menos una prueba de integración o E2E por
historia; las tareas de prueba de cada historia van antes que su implementación y deben fallar primero.

**Organization**: tareas agrupadas por historia de usuario para implementarlas y probarlas de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: monorepo, herramientas de formato y servicios locales

- [X] T001 Agregar `.gitattributes` (`* text=auto eol=lf`) y completar `.gitignore` (Node, Python, Playwright, Prisma)
- [X] T002 Crear `package.json` raíz (`packageManager: pnpm@11.9.0`, scripts `dev`, `lint`, `typecheck`, `test`, `test:e2e`, `build`, `db:migrate`, `reports:install`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `allowBuilds`) y `turbo.json`
- [X] T003 [P] Configurar Prettier en `.prettierrc.json` y `.prettierignore`, y `.editorconfig`
- [X] T004 [P] Configurar Husky y commitlint en `.husky/commit-msg` y `commitlint.config.mjs`
- [X] T005 [P] Crear `docker-compose.yml` (PostgreSQL 17 + Redis 7 con healthchecks) e `infra/postgres/init/01-usuario-solo-lectura.sh`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esqueletos de las tres apps y el paquete compartido

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase

- [X] T006 Crear `packages/shared` con el tipo `RespuestaSalud` en `packages/shared/src/salud.ts` y su build a `dist/`
- [X] T007 Generar `apps/api` con NestJS 12 (ESM, Vitest, Oxlint) y quitar el controlador de ejemplo en `apps/api/src/app.module.ts`
- [X] T008 Prueba y validación de entorno con zod en `apps/api/src/config/env.spec.ts` y `apps/api/src/config/env.ts`
- [X] T009 Configurar Prisma 7 en `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts` y `apps/api/src/prisma/prisma.service.ts`
- [X] T010 [P] Crear el cliente Redis compartido en `apps/api/src/redis/redis.module.ts`
- [X] T011 [P] Crear `apps/reports` con uv (`pyproject.toml`, `package.json` puente) y su configuración en `apps/reports/src/reports/config.py`
- [X] T012 [P] Generar `apps/web` con Next.js 16 y configurar Vitest en `apps/web/vitest.config.mts`

**Checkpoint**: `pnpm install`, `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan en las tres apps

---

## Phase 3: User Story 1 - Arranque local reproducible (Priority: P1) 🎯 MVP

**Goal**: los tres componentes arrancan con la guía y la web muestra su estado real

**Independent Test**: seguir `quickstart.md` en limpio y ver la página de estado con API y reportes operativos

### Tests for User Story 1 ⚠️

- [X] T013 [P] [US1] Pruebas unitarias de salud (ok, BD caída, Redis caído, timeout) en `apps/api/src/health/health.service.spec.ts`
- [X] T014 [P] [US1] Prueba e2e de `/health`, error 404 uniforme y cabeceras de seguridad en `apps/api/test/health.e2e-spec.ts`
- [X] T015 [P] [US1] Pruebas de `/health` de reportes en `apps/reports/tests/test_health.py`
- [X] T016 [P] [US1] Pruebas del cliente de salud de la web en `apps/web/src/lib/salud.test.ts` y del componente en `apps/web/src/components/estado-servicio.test.tsx`
- [X] T017 [US1] Prueba E2E de la página de estado en `apps/web/e2e/estado.spec.ts` con `apps/web/playwright.config.ts`

### Implementation for User Story 1

- [X] T018 [US1] Implementar `HealthService` y `HealthController` en `apps/api/src/health/`
- [X] T019 [US1] Configurar `apps/api/src/main.ts` (helmet, CORS, throttler, prefijo `/api`, apagado ordenado)
- [X] T020 [P] [US1] Implementar `/health` de reportes en `apps/reports/src/reports/health.py` y `apps/reports/src/reports/main.py`
- [X] T021 [P] [US1] Implementar el cliente de salud en `apps/web/src/lib/salud.ts`
- [X] T022 [US1] Implementar la página de estado en `apps/web/src/app/page.tsx` y `apps/web/src/components/estado-servicio.tsx` siguiendo `frontend-design`
- [X] T023 [P] [US1] Agregar `.env.example` en `apps/api/`, `apps/reports/` y `apps/web/`

**Checkpoint**: US1 funcional y verificable con `pnpm test:e2e`

---

## Phase 4: User Story 2 - Compuerta de calidad en cada PR (Priority: P1)

**Goal**: cada PR ejecuta estilo, tipos, pruebas y validación de commits; las ramas protegidas lo exigen

**Independent Test**: un PR con una prueba en rojo queda bloqueado

- [X] T024 [US2] Crear el workflow `.github/workflows/ci.yml` con el job `calidad` (PostgreSQL y Redis como servicios, lint, typecheck, test, build, e2e) y el job `commits`
- [X] T025 [US2] Proteger `develop` y `main` (PR obligatorio, checks requeridos, sin push directo) y documentarlo en `CONTRIBUTING.md`

---

## Phase 5: User Story 3 - Despliegue automático por rama (Priority: P2)

**Goal**: `develop` → staging y `main` → producción, solo con la compuerta en verde

**Independent Test**: integrar en `develop` y ver la salud de staging en verde

- [X] T026 [P] [US3] Crear el blueprint `render.yaml` (api, reports, Postgres, Key Value de staging)
- [X] T027 [P] [US3] Crear `apps/web/vercel.json`
- [X] T028 [US3] Agregar el job `deploy` a `.github/workflows/ci.yml` (deploy hooks de Render y CLI de Vercel; se omite sin secretos)
- [X] T029 [US3] Documentar cuentas, secretos y producción en `docs/despliegue.md`

---

## Phase 6: User Story 4 - Base para el trabajo en paralelo (Priority: P2)

**Goal**: cada integrante sabe qué le toca, de qué depende y cómo integrar

**Independent Test**: un integrante nuevo encuentra su spec, rama y contratos solo leyendo el repo

- [X] T030 [P] [US4] Prueba de que `reportes_lectura` no puede escribir en `apps/reports/tests/test_solo_lectura.py`
- [X] T031 [P] [US4] Declarar los puertos entre specs (sin implementación) en `apps/api/src/contracts/`
- [X] T032 [P] [US4] Escribir `docs/equipo/reparto.md`, `docs/equipo/contratos.md` y los briefs `docs/equipo/spec-2-ricardo.md`, `docs/equipo/spec-3-daniel.md`, `docs/equipo/spec-4-erick.md`
- [X] T033 [US4] Actualizar el catálogo `specs/README.md` a 4 specs del equipo
- [X] T034 [P] [US4] Crear `.github/PULL_REQUEST_TEMPLATE.md` y `.github/ISSUE_TEMPLATE/`
- [X] T035 [US4] Escribir `CONTRIBUTING.md` (Git Flow, `feature/spec-X`, Spec Kit, migraciones en paralelo, validación con zod)

---

## Phase 7: User Story 5 - Trazabilidad y análisis estático (Priority: P3)

**Goal**: SonarQube y Grafana listos para conectar

**Independent Test**: con `SONAR_TOKEN`, el PR muestra el análisis; sin él, el paso se omite con aviso

- [X] T036 [US5] Crear `sonar-project.properties` y el job `sonar` en `.github/workflows/ci.yml`
- [X] T037 [P] [US5] Documentar el tablero en `docs/trazabilidad-grafana.md`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T038 [P] Reescribir `README.md` con el estado real y los comandos
- [X] T039 [P] Agregar los comandos reales a `CLAUDE.md`
- [X] T040 Validar `quickstart.md` de punta a punta en una copia limpia y marcar las tareas como hechas

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → historias.
- **US1** depende solo de la fase 2. **US2** necesita US1 (sin pruebas reales la compuerta no prueba nada).
- **US3** y **US5** extienden el workflow de US2. **US4** es independiente de US2/US3/US5 y puede ir en paralelo.

## Parallel Example: User Story 1

```text
T013 apps/api/src/health/health.service.spec.ts
T015 apps/reports/tests/test_health.py
T016 apps/web/src/lib/salud.test.ts
```

## Implementation Strategy

1. MVP = fases 1, 2 y 3: el equipo ya puede clonar y trabajar en local.
2. US2 antes de abrir el PR del spec, para que el propio PR pase por la compuerta.
3. US4 se integra en el mismo PR: desbloquea a Ricardo (Spec 2) y Daniel (Spec 3).
4. US3 y US5 quedan listos para conectar cuando el líder cree las cuentas externas.
