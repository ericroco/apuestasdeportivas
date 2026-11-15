# Quickstart: levantar el stack en local

Requisitos: Node.js 22+, pnpm 11 (`npm install -g pnpm@11`), Python 3.12, [uv](https://docs.astral.sh/uv/), Git y
Docker Desktop (o Docker Engine). Todo se ejecuta desde la raíz del repositorio.

## 1. Clonar e instalar

```powershell
git clone https://github.com/ericroco/apuestasdeportivas.git
cd apuestasdeportivas
pnpm install            # instala web, api y shared, y activa los hooks de commit
pnpm reports:install    # crea el entorno de Python de apps/reports con uv
```

## 2. Configuración local

PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/reports/.env.example apps/reports/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

bash (Linux/macOS/Git Bash):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/reports/.env.example apps/reports/.env
cp apps/web/.env.example apps/web/.env.local
```

Los valores de ejemplo funcionan con el `docker-compose.yml` sin cambios.

## 3. Base de datos y caché

```powershell
docker compose up -d    # PostgreSQL 17 + Redis 7, con el usuario reportes_lectura
pnpm db:migrate         # aplica las migraciones de Prisma
```

Si el puerto 5432 o 6379 está ocupado, crea un `.env` en la raíz con `POSTGRES_PORT=55432` (o `REDIS_PORT=...`) y
ajusta las URLs de los `.env` de las apps.

## 4. Arrancar

```powershell
pnpm dev                # web :3000, api :3001, reports :8000
```

## 5. Verificar

- http://localhost:3000 muestra la página de estado con API y reportes **operativos**.
- `curl http://localhost:3001/health` → `200` con `baseDeDatos` y `cache` en `ok`.
- `curl http://localhost:8000/health` → `200` con `baseDeDatos` en `ok`.
- `docker compose stop redis` y repetir el `curl` de la API → `503` con `cache` en `error`. Luego
  `docker compose start redis`.

## 6. Calidad (lo mismo que corre CI)

```powershell
pnpm lint          # ESLint (web), Oxlint (api), Ruff (reports)
pnpm typecheck     # tsc en web/api/shared, mypy en reports
pnpm test          # Vitest y pytest (requiere docker compose arriba)
pnpm test:e2e      # Playwright: levanta las tres apps y revisa la página de estado
```

Un solo test:

```powershell
pnpm --filter api exec vitest run src/health/health.service.spec.ts
pnpm --filter web exec vitest run src/lib/salud.test.ts
cd apps/reports; uv run pytest tests/test_health.py -k ok
```
