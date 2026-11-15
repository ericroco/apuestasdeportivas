# Variables de entorno nuevas del Spec 2

Se agregan a la validación de cada app, a su `.env.example` y a
`specs/001-fundaciones-stack/contracts/configuracion.md`. Ningún secreto lleva el prefijo `NEXT_PUBLIC_`.

## apps/api

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `JWT_PRIVATE_KEY` | **sí** | — | Clave privada Ed25519 en PEM PKCS#8 (`\n` escapados); solo en la API |
| `JWT_PUBLIC_KEY` | **sí** | — | Clave pública Ed25519 en PEM SPKI; también la usa reportes |
| `JWT_ACCESS_TTL` | no | `900` | Segundos de vida del token de acceso (máximo 900, contrato 6) |
| `JWT_REFRESH_TTL` | no | `604800` | Segundos de vida de la credencial de renovación |
| `COOKIE_SECURE` | no | `true` | `false` solo en desarrollo por HTTP |
| `TOTP_CLAVE_CIFRADO` | **sí** | — | 32 bytes en base64 para cifrar los secretos 2FA |
| `TURNSTILE_SECRET` | **sí** | — | Secreto de Turnstile (de prueba en local y CI) |
| `WEB_PROXY_SECRETO` | **sí** | — | Secreto compartido con el proxy de la web (≥ 32 caracteres) |
| `CORREO_TRANSPORTE` | no | `smtp` | `smtp` (Mailpit) o `resend` |
| `SMTP_URL` | si `smtp` | `smtp://localhost:1025` | Servidor SMTP |
| `RESEND_API_KEY` | si `resend` | — | Clave de la API de correo de staging |
| `CORREO_REMITENTE` | no | `Apuestas <no-responder@localhost>` | Remitente |
| `PAYPHONE_TOKEN` | **sí** | — | Token de la app de Payphone Developer (sandbox) |
| `PAYPHONE_STORE_ID` | **sí** | — | `storeId` de la app |
| `PAYPHONE_BASE_URL` | no | `https://pay.payphonetodoesposible.com` | En Playwright apunta a la pasarela falsa |
| `DEPOSITO_MIN` / `DEPOSITO_MAX` | no | `1.00` / `1000.00` | Límites de depósito (FR-045) |
| `RETIRO_MIN` / `RETIRO_MAX` | no | `5.00` / `1000.00` | Límites de retiro (FR-055) |
| `RETIRO_UMBRAL_REVISION` | no | `100.00` | Sobre este monto, revisión manual (FR-057) |
| `BLOQUEO_INTENTOS` / `BLOQUEO_MINUTOS` | no | `5` / `15` | Bloqueo por intentos fallidos (FR-010) |

## apps/web

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `WEB_PROXY_SECRETO` | **sí** | — | El mismo de la API; solo en el servidor de Next.js |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **sí** | — | Clave pública del widget |

## apps/reports (las agrega el Spec 4)

| Variable | Descripción |
|----------|-------------|
| `JWT_PUBLIC_KEY` | La misma clave pública de la API, para verificar el token |

## docker-compose.yml

Servicio `mailpit` (`axllent/mailpit`): SMTP en `1025` y la interfaz web en `8025`.
