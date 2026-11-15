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
   - API: `WEB_ORIGIN` = URL de staging de Vercel.
   - Reportes: `WEB_ORIGIN`, `REPORTS_DATABASE_URL` (ver paso 3) y `JWT_PUBLIC_KEY` (la clave **pública** con la
     que firma la API; nunca la privada).
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
   - Preview: `API_URL` y `REPORTS_URL` de staging.
   - Production: las de producción.
3. En `apps/web`: `npx vercel link` y copiar `orgId` y `projectId` a los secretos de GitHub. No subas `.vercel/`
   (está en `.gitignore`).

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
