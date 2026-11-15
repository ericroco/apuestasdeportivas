# Apuestas deportivas

Plataforma web de apuestas deportivas con resultados en tiempo real. Proyecto académico de Arquitectura de Software
(UTPL): no opera con dinero real y los pagos usan el sandbox de Payphone. La seguridad y la prevención de fraude son
el criterio prioritario.

Se desarrolla con **Specification-Driven Development** (Spec Kit): cada funcionalidad nace como especificación,
plan y lista de tareas en `specs/` antes de escribir código.

## Arquitectura

| App | Tecnología | Rol | Despliegue |
|-----|------------|-----|------------|
| `apps/web` | Next.js 16 | Solo presentación | Vercel |
| `apps/api` | NestJS 12 + Prisma 7 | Dueña del dinero, las apuestas y la liquidación | Render |
| `apps/reports` | FastAPI (Python 3.12) | Reportes con usuario de BD de solo lectura | Render |
| `packages/shared` | TypeScript | Tipos compartidos web ↔ API | — |

PostgreSQL 17 y Redis 7 (Docker en local, Render en staging). Monorepo con pnpm 11 y Turborepo.

## Empezar

```powershell
pnpm install
pnpm reports:install
# copiar apps/*/.env.example (ver quickstart)
docker compose up -d
pnpm db:migrate
pnpm dev        # web :3000 · api :3001 · reports :8000
```

Guía completa: [`specs/001-fundaciones-stack/quickstart.md`](specs/001-fundaciones-stack/quickstart.md).

## Documentos

| Documento | Para qué |
|-----------|----------|
| [`promtp.md`](promtp.md) | Requisitos del sistema (fuente de verdad) |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Principios no negociables |
| [`PLAN.md`](PLAN.md) | Roadmap y decisiones técnicas base |
| [`specs/README.md`](specs/README.md) | Catálogo de specs del equipo y su estado |
| [`docs/equipo/reparto.md`](docs/equipo/reparto.md) | Quién hace qué, dependencias y calendario |
| [`docs/equipo/contratos.md`](docs/equipo/contratos.md) | Contratos entre specs |
| [`docs/equipo/spec-2-entrega.md`](docs/equipo/spec-2-entrega.md) | Entrega del Spec 2: qué hay, qué hacer tras el merge y qué cambia para los specs 3 y 4 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Flujo de trabajo: Spec Kit, ramas, PRs, commits, migraciones |
| [`docs/despliegue.md`](docs/despliegue.md) | Render, Vercel, SonarQube y secretos |
| [`docs/trazabilidad-grafana.md`](docs/trazabilidad-grafana.md) | Tablero de trazabilidad del equipo |

## Equipo

| Integrante | Specs |
|------------|-------|
| Erick Rodas (líder) | 1. Fundaciones del stack · 4. Promociones, antifraude y reportes |
| Ricardo | 2. Identidad, billetera y pagos |
| Daniel Campoverde | 3. Partidos, apuestas y liquidación |
