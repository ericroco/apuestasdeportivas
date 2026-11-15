# Despliegue y servicios externos

Lo que el repositorio ya trae y lo que el líder configura una sola vez a mano. Mientras falte algún secreto, CI
**omite** ese paso con un aviso y la compuerta sigue en verde (spec 1, FR-017 y FR-018).

## Flujo

```text
PR a develop/main ──▶ CI: formato → lint → tipos → migraciones → pruebas → E2E ──▶ SonarQube
merge en develop  ──▶ CI completo ──▶ job "Desplegar" (entorno GitHub "staging")    ──▶ Render + Vercel preview
merge en main     ──▶ CI completo ──▶ job "Desplegar" (entorno GitHub "produccion") ──▶ Render + Vercel production
```

Render y Vercel **no** despliegan solos: `render.yaml` usa `autoDeployTrigger: off` y `apps/web/vercel.json`
desactiva los despliegues por Git. Así nada llega a un entorno sin pasar la compuerta.

## Secretos de GitHub

Settings → Environments → crear `staging` y `produccion` (CI los crea al primer despliegue si no existen). En cada
uno:

| Secreto | De dónde sale |
|---------|---------------|
| `RENDER_DEPLOY_HOOK_API` | Render → servicio de la API → Settings → Deploy Hook |
| `RENDER_DEPLOY_HOOK_REPORTS` | Render → servicio de reportes → Settings → Deploy Hook |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` | `.vercel/project.json` después de `npx vercel link` en `apps/web` |

A nivel de repositorio (Settings → Secrets and variables → Actions): `SONAR_TOKEN`.

## Render (staging)

1. Render → New → **Blueprint** → elegir este repo y la rama `develop`. Render lee `render.yaml` y crea la API, el
   servicio de reportes, PostgreSQL y Key Value.
2. Completar las variables marcadas `sync: false`:
   - API: `WEB_ORIGIN` = URL de staging de Vercel, y las del Spec 2 (sección
     [Variables y servicios del Spec 2](#variables-y-servicios-del-spec-2)).
   - Reportes: `WEB_ORIGIN` y `REPORTS_DATABASE_URL` (ver paso 3).
3. Crear el usuario de solo lectura (una vez). `render.yaml` bloquea las conexiones externas a la BD
   (`ipAllowList: []`), así que primero agrega **temporalmente** tu IP en la base de datos → Access Control. Luego,
   con la **External Database URL**:

   ```bash
   psql "<External Database URL>" -v dbname=apuestas -v owner=apuestas \
        -v reportes_password='<contraseña larga y aleatoria>' \
        -f infra/postgres/usuario-solo-lectura.sql
   ```

   Quita tu IP de Access Control al terminar. `REPORTS_DATABASE_URL` es la **Internal Database URL** con el
   usuario y la contraseña cambiados por `reportes_lectura` y la que elegiste. Nunca uses la URL del dueño en
   reportes.

   **Riesgo residual**: Render no da superusuario, así que el script no puede quitarle a PUBLIC la creación de
   *large objects* (verás un `WARNING`). `reportes_lectura` sigue sin poder tocar tablas ni crear tablas
   temporales, pero podría crear large objects si se filtrara su contraseña. En Docker y en CI sí se revoca, y
   `tests/test_solo_lectura.py` lo verifica.
4. Copiar los deploy hooks a los secretos del entorno `staging` de GitHub.
5. Verificar `https://<api>.onrender.com/health` y `https://<reportes>.onrender.com/health`. El plan gratuito duerme
   los servicios sin tráfico: la primera petición tarda unos 50 s.

## Vercel

1. Vercel → Add New → Project → este repo, **Root Directory** `apps/web` (Vercel detecta pnpm y Turborepo).
2. Variables de entorno del proyecto:
   - Preview: `API_URL` y `REPORTS_URL` de staging, `WEB_PROXY_SECRETO` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Spec 2).
   - Production: las de producción.
3. En `apps/web`: `npx vercel link` y copiar `orgId` y `projectId` a los secretos de GitHub. No subas `.vercel/`
   (está en `.gitignore`).

## Variables y servicios del Spec 2

Desde el Spec 2 la API **no arranca** sin estas variables. Cárgalas en Render y Vercel antes de integrar el PR a
`develop` (después de cargarlas, Render redespliega el servicio).

### 1. Secretos que se generan

En tu equipo, desde la raíz del repo, genera un juego **nuevo** solo para staging (no reutilices el de tu `.env`):

```bash
pnpm --filter api exec tsx scripts/generar-secretos.ts
```

Imprime 4 líneas. Cópialas así:

| Variable | Render, servicio API | Render, servicio reportes | Vercel |
|----------|:-:|:-:|:-:|
| `JWT_PRIVATE_KEY` | ✅ | — | — |
| `JWT_PUBLIC_KEY` | ✅ | ✅ (cuando el Spec 4 la use) | — |
| `TOTP_CLAVE_CIFRADO` | ✅ | — | — |
| `WEB_PROXY_SECRETO` | ✅ | — | ✅ (el mismo valor) |

Las claves PEM salen en una sola línea con `\n`: pégalas tal cual, la API las normaliza. `JWT_PRIVATE_KEY` nunca
va en reportes ni en Vercel. Si cambias `TOTP_CLAVE_CIFRADO` después, los 2FA ya activados dejan de funcionar.

### 2. Cloudflare Turnstile (CAPTCHA)

1. En el panel de Cloudflare → Turnstile → **Add widget**, con el dominio de staging de Vercel.
2. **Site key** → Vercel, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (es pública, llega al navegador).
3. **Secret key** → Render (API), `TURNSTILE_SECRET`. Las claves de prueba (`1x000…AA`) se rechazan en staging
   porque corre con `NODE_ENV=production`.

### 3. Correo con Resend

El plan gratuito de Render puede bloquear el SMTP saliente, así que `render.yaml` ya fija `CORREO_TRANSPORTE=resend`.

1. Crear una cuenta gratuita en Resend y una **API key** → Render (API), `RESEND_API_KEY`.
2. `CORREO_REMITENTE` → Render (API), p. ej. `Apuestas <onboarding@resend.dev>` (el remitente de prueba de Resend;
   para otro dominio hay que verificarlo en Resend).

### 4. Payphone (sandbox)

1. En Payphone Developer, crear una aplicación **web** en modo de pruebas (las transacciones se aprueban sin
   cobrar).
2. Registrar el dominio de staging de Vercel: Payphone devuelve al usuario a `<web>/billetera/deposito/retorno`.
3. **Token** → Render (API), `PAYPHONE_TOKEN`. **storeId** → `PAYPHONE_STORE_ID`.

### 5. Variables con valor por defecto (opcionales)

`JWT_ACCESS_TTL` (900), `JWT_REFRESH_TTL` (604800), `COOKIE_SECURE` (true), `BLOQUEO_INTENTOS` (5),
`BLOQUEO_MINUTOS` (15), `DEPOSITO_MIN`/`DEPOSITO_MAX` (1.00/1000.00), `RETIRO_MIN`/`RETIRO_MAX` (5.00/1000.00),
`RETIRO_UMBRAL_REVISION` (100.00). Tabla completa en
[`specs/001-fundaciones-stack/contracts/configuracion.md`](../specs/001-fundaciones-stack/contracts/configuracion.md).

### 6. Primer administrador en staging

Con el servicio de la API desplegado, desde su **Shell** en Render (o en local con la `DATABASE_URL` externa):

```bash
ADMIN_EMAIL=tu@correo ADMIN_NOMBRE="Tu Nombre" ADMIN_CONTRASENA='una-contraseña-larga' \
  pnpm --filter api exec tsx scripts/crear-administrador.ts
```

Al iniciar sesión la web le pide activar el 2FA. Desde **Admin → Usuarios** se crean los operadores.

### 7. Comprobación

- `https://<api>.onrender.com/health` responde 200 (si falta una variable, el log de Render nombra cuál).
- En la web de staging: registrarse, recibir el correo, confirmar, iniciar sesión y depositar 1.00 en el sandbox.

## Producción

Render gratuito permite una sola PostgreSQL. Para producción, duplicar los cuatro recursos de `render.yaml` con
sufijo `-prod`, `branch: main` y una base de datos con plan propio (o en otro workspace), y cargar sus hooks en el
entorno `produccion` de GitHub. Hasta entonces, el job de producción se omite con aviso.

## SonarQube Cloud

1. https://sonarcloud.io → iniciar sesión con GitHub → importar `apuestasdeportivas`.
2. Analysis Method → **GitHub Actions** (desactivar "Automatic Analysis").
3. Copiar el token como secreto `SONAR_TOKEN` del repositorio.
4. Si la organización o la clave del proyecto difieren, ajustar `sonar-project.properties`.
5. El job `sonar` espera la compuerta (`sonar.qualitygate.wait=true`): si falla, el PR queda bloqueado.

## Protección de ramas

`develop` y `main` exigen PR, una aprobación y los checks `Lint, tipos, pruebas y E2E` y `Conventional Commits`.
Detalle en [`CONTRIBUTING.md`](../CONTRIBUTING.md).
