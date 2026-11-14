# Contrato de configuración (variables de entorno)

Cada aplicación valida estas variables al arrancar y **no inicia** si falta una obligatoria o es inválida; el
mensaje nombra la variable (FR-007). Los valores reales nunca se versionan: cada app trae su `.env.example`.

## apps/api

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `NODE_ENV` | no | `development` | `development`, `test` o `production` |
| `PORT` | no | `3001` | Puerto HTTP |
| `DATABASE_URL` | **sí** | — | URL de PostgreSQL del usuario `apuestas` |
| `REDIS_URL` | **sí** | — | URL de Redis (`redis://` o `rediss://`) |
| `WEB_ORIGIN` | **sí** | — | Origen permitido por CORS (p. ej. `http://localhost:3000`); se normaliza quitando ruta y barra final |
| `THROTTLE_LIMIT` | no | `100` | Peticiones permitidas por IP en la ventana |
| `THROTTLE_TTL_MS` | no | `60000` | Ventana del rate limiting en ms |
| `TRUST_PROXY_HOPS` | no | `0` | Proxies de confianza para leer la IP real del cliente; `1` en Render |

Los specs siguientes agregan las suyas a esta tabla y al esquema de validación (`apps/api/src/config/env.ts`):
Spec 2 (`JWT_*`, `PAYPHONE_*`), Spec 3 (`API_FOOTBALL_*`), Spec 4 (las de cupones y fraude).

## apps/reports

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `PORT` | no | `8000` | Puerto HTTP (lo usa el comando de arranque) |
| `REPORTS_DATABASE_URL` | **sí** | — | URL de PostgreSQL del usuario **`reportes_lectura`** |
| `WEB_ORIGIN` | **sí** | — | Origen permitido por CORS |

## apps/web

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `API_URL` | no | `http://localhost:3001` | URL de la API usada **desde el servidor** de Next.js |
| `REPORTS_URL` | no | `http://localhost:8000` | URL de reportes usada desde el servidor de Next.js |

Ninguna variable con secretos lleva el prefijo `NEXT_PUBLIC_`: todo lo que tenga ese prefijo llega al navegador.

## docker-compose.yml (solo desarrollo)

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `POSTGRES_PORT` | `5432` | Puerto local de PostgreSQL |
| `REDIS_PORT` | `6379` | Puerto local de Redis |
| `REPORTES_PASSWORD` | `reportes_local` | Contraseña local del usuario `reportes_lectura` |
