# Cómo contribuir

Reglas del equipo para trabajar en paralelo sin romper `develop`. La [constitución](.specify/memory/constitution.md)
prevalece sobre esta guía.

## 1. Primer arranque

Sigue [`specs/001-fundaciones-stack/quickstart.md`](specs/001-fundaciones-stack/quickstart.md): clonar,
`pnpm install`, `pnpm reports:install`, copiar los `.env.example`, `docker compose up -d`, `pnpm db:migrate` y
`pnpm dev`. Qué te toca está en [`docs/equipo/reparto.md`](docs/equipo/reparto.md).

## 2. Flujo de un spec con Spec Kit (SDD)

Desde la raíz del repo, con Claude Code abierto:

```text
git switch develop && git pull

/speckit-specify GIT_BRANCH_NAME=feature/spec-2 SPECIFY_FEATURE_DIRECTORY=specs/002-identidad-billetera-pagos <descripción de tu brief>
/speckit-clarify     # opcional: resuelve ambigüedades del spec
/speckit-plan        # plan.md, research.md, data-model.md, contracts/, quickstart.md
/speckit-tasks       # tasks.md ordenado por historias de usuario
/speckit-analyze     # consistencia entre spec, plan y tareas
/speckit-implement   # ejecuta las tareas (pruebas primero)
```

- Cambia `2` y la carpeta por los de tu spec (tabla en `reparto.md`). `GIT_BRANCH_NAME` hace que el hook de Spec Kit
  cree tu rama `feature/spec-X` desde `develop`.
- Haz un commit después de cada paso: `docs(spec-2): especificación…`, `docs(spec-2): plan técnico…`,
  `docs(spec-2): lista de tareas…`, y luego los commits de implementación.
- El bloque SPECKIT de `CLAUDE.md` ya lista los planes de los cuatro specs: no lo reescribas.
- `.specify/feature.json` es local (está en `.gitignore`).

## 3. Ramas y Pull Requests

- Git Flow: `main` (producción), `develop` (integración), `feature/spec-X`, `release/*`, `hotfix/*`.
- `develop` y `main` están protegidas: sin push directo, PR obligatorio con **una aprobación** y los checks
  `Lint, tipos, pruebas y E2E` y `Conventional Commits` en verde.
- Un spec puede entrar en varios PRs desde la misma rama (ver el plan de PRs de tu brief). Tras un merge, sigue en la
  misma rama: `git pull origin develop`.
- Antes de abrir el PR: actualiza tu rama con `develop` y corre `pnpm lint && pnpm typecheck && pnpm test`.
- Revisión cruzada: cada PR lo aprueba otro integrante. Revisa contra la constitución, no solo el estilo.

## 4. Commits

- Conventional Commits en español, atómicos y que compilen: `feat(apuestas): acepta combinadas de hasta 10
  selecciones`, `test(billetera): débitos concurrentes no dejan saldo negativo`, `fix(web): …`, `docs(spec-3): …`.
- El hook `commit-msg` (Husky + commitlint) rechaza el mensaje si no cumple el formato; CI vuelve a validarlo.
- **Windows**: si al confirmar ves `node: not found` desde Git Bash, tu `PATH` tiene una entrada rota que corta la
  conversión de rutas. Confirma desde PowerShell o corrige el `PATH`.

## 5. Base de datos y migraciones en paralelo

- El esquema de Prisma está dividido por spec en `apps/api/prisma/schema/`: `identidad.prisma` (Spec 2),
  `partidos.prisma` (Spec 3), `promociones.prisma` (Spec 4). No agregues modelos a `base.prisma`.
- Modelos en español y PascalCase; tablas y columnas en `snake_case` con `@@map`/`@map` (los lee reportes).
- Crea migraciones con `pnpm --filter api exec prisma migrate dev --name <spec>_<cambio>`.
- Antes del PR, actualiza tu rama con `develop`. Si entró una migración con fecha **posterior** a la tuya, borra tu
  carpeta de migración y vuelve a generarla para que quede última. Nunca edites una migración que ya está en
  `develop`.

## 6. Convenciones de código

- Dominio en español (`Apuesta`, `debitarApuesta`); términos del framework en su idioma.
- API en ESM: los imports relativos terminan en `.js`. Pruebas con Vitest (`vi.fn()`).
- Validación de entrada con zod y `StandardSchemaValidationPipe` (`@Body({ schema })`), objetos `.strict()`.
- Dinero siempre en `Prisma.Decimal`, nunca `number`. Montos en BD como `Decimal(14, 2)`.
- Logs con el `Logger` de Nest; sin `console.log`. Nada de secretos en el código ni en los logs.
- Variables de entorno nuevas: agrégalas a la validación de la app, a su `.env.example` y a
  `specs/001-fundaciones-stack/contracts/configuracion.md`.
- Puertos entre specs: `apps/api/src/contracts/` ([contratos.md](docs/equipo/contratos.md)). Cambiar una firma
  requiere acuerdo con el otro spec en el PR.
- UI: skill `frontend-design`, mobile-first desde 360 px, WCAG 2.1 AA, textos que nombran la acción.

## 7. Comandos

| Comando | Qué hace |
|---------|----------|
| `pnpm dev` | Web :3000, API :3001 y reportes :8000 |
| `pnpm lint` / `pnpm typecheck` | ESLint, Oxlint y Ruff / tsc y mypy |
| `pnpm test` | Vitest y pytest (unitarias e integración; requiere `docker compose up -d`) |
| `pnpm test:e2e` | Playwright de punta a punta (compila y levanta las tres apps) |
| `pnpm format` | Prettier |
| `pnpm db:migrate` | Aplica migraciones de Prisma |
| `pnpm --filter api exec vitest run <archivo>` | Una prueba de la API |
| `cd apps/reports; uv run pytest tests/<archivo> -k <nombre>` | Una prueba de reportes |
