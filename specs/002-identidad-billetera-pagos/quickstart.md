# Quickstart: Identidad, billetera y pagos

Parte del entorno del Spec 1 ([quickstart](../001-fundaciones-stack/quickstart.md)): `pnpm install`,
`docker compose up -d` (ahora también levanta Mailpit) y `pnpm db:migrate`. Comandos desde PowerShell en la raíz.

## 1. Secretos locales

Generar el par de claves Ed25519 y la clave de cifrado de 2FA (se pegan en `apps/api/.env`; la pública también en
`apps/reports/.env` cuando el Spec 4 la use):

```bash
node -e "const c=require('node:crypto');const k=c.generateKeyPairSync('ed25519');const e=s=>JSON.stringify(s).slice(1,-1);console.log('JWT_PRIVATE_KEY=\"'+e(k.privateKey.export({type:'pkcs8',format:'pem'}))+'\"');console.log('JWT_PUBLIC_KEY=\"'+e(k.publicKey.export({type:'spki',format:'pem'}))+'\"');console.log('TOTP_CLAVE_CIFRADO='+c.randomBytes(32).toString('base64'));console.log('WEB_PROXY_SECRETO='+c.randomBytes(32).toString('base64url'))"
```

`WEB_PROXY_SECRETO` va igual en `apps/api/.env` y `apps/web/.env.local`. Turnstile usa las claves de prueba de
Cloudflare que ya traen los `.env.example`.

## 2. Payphone sandbox

1. Crear una cuenta en Payphone Developer y una aplicación de tipo web en modo de pruebas.
2. Copiar el token y el `storeId` a `PAYPHONE_TOKEN` y `PAYPHONE_STORE_ID`.
3. Registrar el dominio de la web (`http://localhost:3000` si lo admite; si no, probar el sandbox en staging).
4. En pruebas, Payphone aprueba todos los pagos sin cobrar.

Las pruebas automáticas **no** usan Payphone: Vitest usa un doble del puerto y Playwright una pasarela falsa local.

## 3. Primer administrador

```bash
pnpm --filter api exec tsx scripts/crear-administrador.ts
```

Pide correo y contraseña. Al entrar por primera vez, la web pide activar el 2FA.

## 4. Recorrido manual

1. `pnpm dev` y abrir `http://localhost:3000/registro`; crear una cuenta mayor de edad.
2. Abrir Mailpit (`http://localhost:8025`), seguir el enlace de verificación.
3. Iniciar sesión, ir a **Billetera → Depositar**, depositar `10.00` en el sandbox y volver: el saldo real sube a
   `10.00`.
4. Activar el 2FA en **Seguridad**, solicitar un retiro de `5.00`: queda pagado con referencia simulada.
5. Con el administrador: **Admin → Usuarios** (roles y suspensión), **Admin → Retiros** (un retiro de más de
   `100.00` queda ahí) y **Admin → Auditoría**.

## 5. Pruebas

| Qué | Comando |
|-----|---------|
| Unitarias de la API | `pnpm --filter api exec vitest run` |
| Integración (PostgreSQL y Redis reales) | `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts` |
| Solo concurrencia del libro contable | `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/billetera-concurrencia.e2e-spec.ts` |
| Web | `pnpm --filter web exec vitest run` |
| E2E (Playwright, levanta las tres apps y la pasarela falsa) | `pnpm test:e2e` |

Las pruebas de integración necesitan `REPORTS_DATABASE_URL` (usuario `reportes_lectura`) para comprobar que no lee
las tablas sensibles; en local se agrega a `apps/api/.env` con la contraseña de `docker-compose.yml`.
