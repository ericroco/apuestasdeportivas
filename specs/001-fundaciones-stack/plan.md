# Implementation Plan: Fundaciones del stack tecnológico

**Branch**: `feature/spec-1` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-fundaciones-stack/spec.md`

## Summary

Inicializar el monorepo con las tres aplicaciones que fija la constitución (`apps/web` Next.js, `apps/api` NestJS,
`apps/reports` FastAPI) y un paquete compartido de tipos, con PostgreSQL y Redis en Docker para desarrollo,
comprobaciones de salud que verifican dependencias reales, compuerta de calidad en GitHub Actions (lint, tipos,
pruebas unitarias, de integración y E2E, Conventional Commits, SonarQube condicional), despliegue por rama a Render y
Vercel disparado desde CI, y la documentación de reparto y contratos para que los specs 2, 3 y 4 avancen en paralelo.

## Technical Context

**Language/Version**: TypeScript 6.0 sobre Node.js 22 LTS (`apps/web`, `apps/api`, `packages/shared`); Python 3.12 (`apps/reports`)
**Primary Dependencies**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4; NestJS 12 (ESM) + Prisma 7 (`@prisma/adapter-pg`) + ioredis + helmet + `@nestjs/throttler` + zod; FastAPI + pydantic-settings + psycopg 3; pnpm 11 workspaces + Turborepo 2; ESLint (web) y Oxlint (API) + Prettier; Ruff + mypy; Husky + commitlint
**Storage**: PostgreSQL 17 (Docker en local, Render Postgres en staging) y Redis 7 (Docker en local, Render Key Value en staging)
**Testing**: Vitest + Supertest (API, unitarias y e2e contra BD/Redis reales); Vitest + Testing Library (web); Playwright (E2E de punta a punta de las tres apps); pytest + httpx (reportes)
**Target Platform**: Render (contenedores Linux, runtimes Node y Python) y Vercel; desarrollo en Windows, Linux y macOS
**Project Type**: Monorepo web (frontend + API + servicio de reportes)
**Performance Goals**: comprobación de salud ≤ 5 s incluso con dependencias caídas (timeout de 2 s por dependencia); compuerta de CI ≤ 10 min
**Constraints**: planes gratuitos (una sola BD gratuita en Render); exactamente tres aplicaciones; sin Java ni Rust en el código del proyecto
**Scale/Scope**: 3 integrantes, 4 specs; este spec no crea tablas de negocio

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Seguridad y antifraude**: secretos solo en variables de entorno validadas al arrancar; `.env` ignorado; helmet,
  CORS restringido al origen de la web y rate limiting global desde el primer endpoint; la salud no expone
  credenciales. Este spec solo crea endpoints públicos de salud; el guard global de denegación por defecto lo registra
  el Spec 2 y la salud ya queda marcada con el decorador `@Publico()` del contrato de autenticación.
- [x] **II. Integridad financiera**: no mueve dinero. Deja declarado el puerto `BilleteraPort`, cuyas operaciones
  reciben el cliente transaccional de Prisma y una clave de idempotencia, para que el Spec 3 descuente saldo y registre
  la apuesta en una sola transacción.
- [x] **III. Servidor como autoridad**: la web solo consulta y presenta el estado; no calcula nada de negocio.
- [x] **IV. Pruebas primero**: las pruebas de salud (unitarias, e2e y Playwright) se escriben antes que la
  implementación. No hay dominio crítico en este spec.
- [x] **V. Tiempo real**: no aplica todavía; Redis queda aprovisionado y verificado para el pub/sub y las colas del
  Spec 3.
- [x] **VI. Simplicidad**: solo `apps/web`, `apps/api`, `apps/reports`; `packages/shared` es una librería de tipos, no
  un servicio. Reportes usa un usuario de BD de solo lectura creado por script.
- [x] **VII. UX**: la página de estado es mobile-first desde 360 px, cumple WCAG 2.1 AA y sigue el skill
  `frontend-design`.

**Re-evaluación post-diseño**: sin cambios; todas las compuertas siguen en verde.

## Project Structure

### Documentation (this feature)

```text
specs/001-fundaciones-stack/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── salud.openapi.yaml       # GET /health de API y reportes
│   └── configuracion.md         # variables de entorno por aplicación
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── api/                         # NestJS: dueño del dinero, apuestas y liquidación
│   ├── prisma/schema.prisma     # sin modelos de negocio todavía
│   ├── prisma.config.ts
│   ├── src/
│   │   ├── main.ts              # helmet, CORS, ValidationPipe, prefijo /api
│   │   ├── app.module.ts
│   │   ├── config/              # validación de entorno
│   │   ├── prisma/              # PrismaService global
│   │   ├── redis/               # cliente ioredis compartido
│   │   ├── health/              # GET /health
│   │   └── contracts/           # puertos entre specs (solo interfaces y tokens)
│   └── test/                    # e2e con BD y Redis reales
├── web/                         # Next.js: solo presentación
│   ├── src/app/                 # página de estado del sistema
│   ├── src/lib/                 # cliente de salud (lado servidor)
│   └── e2e/                     # Playwright de punta a punta
└── reports/                     # FastAPI: lectura con usuario de solo lectura
    ├── src/reports/
    └── tests/
packages/
└── shared/                      # tipos compartidos web ↔ api
infra/
└── postgres/init/               # crea el usuario de solo lectura
docs/
├── equipo/                      # reparto, contratos y briefs por integrante
├── despliegue.md
└── trazabilidad-grafana.md
.github/                         # CI, plantillas de PR e issues
docker-compose.yml  render.yaml  turbo.json  pnpm-workspace.yaml  sonar-project.properties
```

**Structure Decision**: monorepo pnpm + Turborepo como fija `PLAN.md`. Cada app conserva su propia configuración de
lint y pruebas; la raíz orquesta con `turbo run`. La app Python se gestiona con `uv`, pero tiene un `package.json`
mínimo cuyos scripts (`dev`, `lint`, `typecheck`, `test`) llaman a `uv run`, para que `pnpm dev` y `turbo run` cubran
las tres apps con los mismos comandos.

## Complexity Tracking

Sin violaciones que justificar.

- La constitución y `PLAN.md` nombraban Jest; NestJS 12 genera los proyectos en ESM con Vitest (API compatible con
  Jest) y Oxlint. Se adopta el default del framework y se enmienda la constitución a 1.0.1 (PATCH: cambia el nombre
  de la herramienta, no el principio). Ver `research.md` §7.
- Nota: Turborepo y partes de Next.js están escritos en Rust, pero la prohibición de la
constitución aplica al código del proyecto, no a las herramientas de terceros (Turborepo ya está en `PLAN.md`).
