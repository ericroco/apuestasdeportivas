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
| `CUPON_ROLLOVER_MULTIPLICADOR` | no | `5` | Spec 4. Requisito de rollover = bono × multiplicador (1–50) |
| `CUPON_ROLLOVER_CUOTA_MINIMA` | no | `1.50` | Spec 4. Cuota total mínima para que una apuesta cuente en el rollover (1.01–10) |
| `BONO_VIGENCIA_DIAS` | no | `30` | Spec 4. Días para cumplir el rollover de un bono (1–365) |
| `FRAUDE_IP_MAX_CUENTAS` | no | `3` | Spec 4. Cuentas por IP en la ventana antes de alertar (1–100) |
| `FRAUDE_IP_VENTANA_HORAS` | no | `24` | Spec 4. Ventana de la regla de IP (1–720) |
| `FRAUDE_APUESTA_FACTOR` | no | `10` | Spec 4. Veces el promedio de apuestas para alertar por monto (2–1000) |
| `FRAUDE_APUESTA_HISTORIAL_MIN` | no | `5` | Spec 4. Apuestas previas necesarias para evaluar el monto (1–1000) |
| `FRAUDE_RAFAGA_MAX_APUESTAS` | no | `10` | Spec 4. Apuestas en la ventana antes de alertar por ráfaga (2–1000) |
| `FRAUDE_RAFAGA_VENTANA_SEG` | no | `60` | Spec 4. Ventana de la regla de ráfaga en segundos (5–3600) |
| `FRAUDE_RETIRO_VENTANA_HORAS` | no | `24` | Spec 4. Ventana desde el último depósito al evaluar un retiro (1–720) |
| `FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT` | no | `50` | Spec 4. % del depósito que debe apostarse para no alertar al retirar (1–1000) |

Los specs siguientes agregan las suyas a esta tabla y al esquema de validación (`apps/api/src/config/env.ts`):
Spec 2 (`JWT_*`, `PAYPHONE_*`), Spec 3 (`API_FOOTBALL_*`), Spec 4 (las de cupones y fraude).

## apps/reports

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `PORT` | no | `8000` | Puerto HTTP (lo usa el comando de arranque) |
| `REPORTS_DATABASE_URL` | **sí** | — | URL de PostgreSQL del usuario **`reportes_lectura`** |
| `WEB_ORIGIN` | **sí** | — | Origen permitido por CORS |
| `JWT_PUBLIC_KEY` | **sí** | — | Spec 4. Clave **pública** PEM con la que la API firma el token de acceso (contrato 6); los `\n` escapados se aceptan. Debe corresponder a `JWT_ALGORITHM` (Ed25519 o RSA de 2048 bits o más) |
| `JWT_ALGORITHM` | no | `EdDSA` | Spec 4. `EdDSA` o `RS256`, el mismo con el que firma el Spec 2; nunca `none` ni HMAC |
| `JWT_ISSUER` | no | `apuestas-api` | Spec 4. Claim `iss` esperado |
| `JWT_AUDIENCE` | no | `apuestas` | Spec 4. Claim `aud` esperado |

Reportes nunca recibe la clave privada. En local, mientras el Spec 2 no emita tokens,
`uv run python -m reports.herramientas.clave_dev` (desde `apps/reports`) genera un par de prueba en memoria e imprime
la clave pública para `.env` y un token de administrador de 15 minutos.

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
