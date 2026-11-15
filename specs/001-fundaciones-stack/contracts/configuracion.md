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
| `JWT_PRIVATE_KEY` | **sí** | — | Spec 2. Clave privada Ed25519 (PEM PKCS#8, acepta `\n` escritos); solo en la API |
| `JWT_PUBLIC_KEY` | **sí** | — | Spec 2. Clave pública Ed25519 (PEM SPKI); debe corresponder a la privada |
| `JWT_ACCESS_TTL` | no | `900` | Spec 2. Segundos de vida del token de acceso (60 a 900) |
| `JWT_REFRESH_TTL` | no | `604800` | Spec 2. Segundos de vida de la credencial de renovación |
| `COOKIE_SECURE` | no | `true` | Spec 2. `false` solo en local por HTTP; obligatorio `true` en producción |
| `TOTP_CLAVE_CIFRADO` | **sí** | — | Spec 2. 32 bytes en base64 para cifrar los secretos 2FA |
| `TURNSTILE_SECRET` | **sí** | — | Spec 2. Secreto de Cloudflare Turnstile; los de prueba se rechazan en producción |
| `WEB_PROXY_SECRETO` | **sí** | — | Spec 2. Secreto compartido con el proxy de la web (≥ 32 caracteres) |
| `CORREO_TRANSPORTE` | no | `smtp` | Spec 2. `smtp` (Mailpit en local) o `resend` (staging) |
| `SMTP_URL` | no | `smtp://localhost:1025` | Spec 2. Servidor SMTP (`smtp://` o `smtps://`) |
| `RESEND_API_KEY` | si `resend` | — | Spec 2. Clave de la API de correo |
| `CORREO_REMITENTE` | no | `Apuestas <no-responder@localhost>` | Spec 2. Remitente de los correos |
| `BLOQUEO_INTENTOS` | no | `5` | Spec 2. Intentos fallidos antes del bloqueo |
| `BLOQUEO_MINUTOS` | no | `15` | Spec 2. Duración del bloqueo |

Los secretos del Spec 2 para desarrollo y CI se generan con
`pnpm --filter api exec tsx scripts/generar-secretos.ts` (nunca se versionan ni se reutilizan en staging).

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
| `WEB_PROXY_SECRETO` | **sí** | — | Spec 2. El mismo valor que en la API; solo en el servidor de Next.js |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **sí** | — | Spec 2. Clave pública del widget de Turnstile (llega al navegador) |

Ninguna variable con secretos lleva el prefijo `NEXT_PUBLIC_`: todo lo que tenga ese prefijo llega al navegador.

## docker-compose.yml (solo desarrollo)

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `POSTGRES_PORT` | `5432` | Puerto local de PostgreSQL |
| `REDIS_PORT` | `6379` | Puerto local de Redis |
| `REPORTES_PASSWORD` | `reportes_local` | Contraseña local del usuario `reportes_lectura` |
