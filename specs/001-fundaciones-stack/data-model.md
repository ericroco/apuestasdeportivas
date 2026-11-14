# Data Model: Fundaciones del stack tecnológico

Este spec **no crea tablas de negocio**. El esquema de Prisma queda con el `datasource` y el generador, y cada spec
agrega sus modelos y migraciones. Lo que sí define este spec:

## 1. Roles de base de datos

| Rol | Lo usa | Permisos | Dónde se crea |
|-----|--------|----------|---------------|
| `apuestas` | `apps/api` (y Prisma Migrate) | Dueño del esquema `public`: crea tablas, lee y escribe | `POSTGRES_USER` del contenedor / usuario por defecto de Render |
| `reportes_lectura` | `apps/reports` | `CONNECT`, `USAGE` sobre `public`, `SELECT` en todas las tablas, incluidas las futuras (`ALTER DEFAULT PRIVILEGES FOR ROLE apuestas`) | `infra/postgres/init/01-usuario-solo-lectura.sh` en local; el mismo SQL a mano en Render |

Regla: `reportes_lectura` nunca recibe `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ni `CREATE`. La prueba
`tests/test_solo_lectura.py` de reportes lo verifica contra la BD real.

## 2. Estado de salud (no persistido)

Respuesta de `GET /health` en API y reportes; tipo `RespuestaSalud` en `packages/shared`.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `estado` | `"ok"` \| `"error"` | `"error"` si alguna dependencia falla; HTTP 200 con `ok`, 503 con `error` |
| `servicio` | `"api"` \| `"reports"` | Fijo por aplicación |
| `version` | string | Versión del `package.json` / `pyproject.toml` |
| `fecha` | string ISO 8601 (UTC) | Reloj del servidor |
| `dependencias` | mapa nombre → `{ estado, latenciaMs }` | API: `baseDeDatos`, `cache`. Reportes: `baseDeDatos` |

No incluye mensajes de error, hosts, usuarios ni cadenas de conexión (FR-005). Cada comprobación tiene timeout de
2000 ms; un timeout cuenta como `error`.

## 3. Entornos

| Entorno | Rama | Web | API y reportes | BD y Redis |
|---------|------|-----|----------------|------------|
| local | cualquiera | `pnpm dev` | `pnpm dev` / `uv run` | `docker compose up -d` |
| staging | `develop` | Vercel preview | Render (`render.yaml`) | Render Postgres + Key Value |
| producción | `main` | Vercel production | Render (réplica del blueprint) | Render (plan propio) |

Las variables de cada aplicación están en [`contracts/configuracion.md`](contracts/configuracion.md).
