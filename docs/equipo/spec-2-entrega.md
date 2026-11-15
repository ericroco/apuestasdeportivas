# Entrega del Spec 2: identidad, billetera y pagos

Responsable: Ricardo. Estado: **en revisión** (un solo PR de `feature/spec-2` hacia `develop` con los PR 1, 2 y 3
del brief). Especificación completa en [`specs/002-identidad-billetera-pagos/`](../../specs/002-identidad-billetera-pagos/).

## 1. Qué se entregó

| Área | Qué hace | Dónde |
|------|----------|-------|
| Identidad | Registro con mayoría de edad, CAPTCHA y verificación de correo; inicio de sesión con bloqueo tras 5 fallos; renovación rotativa; recuperación de contraseña; 2FA TOTP con códigos de recuperación | `apps/api/src/identidad/` |
| Roles y acceso | Guard global que deniega por defecto (contrato 1), `@Roles`, alcance `activar-2fa`, rate limiting por la IP real | `apps/api/src/identidad/autenticacion.guard.ts` |
| Auditoría | `AUDITORIA_PORT` (contrato 3), solo inserción, datos sanitizados | `apps/api/src/auditoria/` |
| Billetera | Libro contable de doble entrada inmutable y `BILLETERA_PORT` (contrato 2) | `apps/api/src/billetera/` |
| Depósitos | Payphone sandbox confirmado servidor a servidor | `apps/api/src/pagos/` |
| Retiros | 2FA, mismo titular, pago simulado bajo el umbral y revisión del administrador | `apps/api/src/retiros/` |
| Administración | Usuarios, roles, suspensión, auditoría y retiros pendientes | `apps/api/src/identidad/usuarios-admin.*`, `apps/web/src/app/admin/` |
| Web | Proxy `/api/*`, CSP, pantallas de acceso, 2FA, cuenta, billetera, depósito, retiro y administración | `apps/web/src/app/` |

Qué prueba cubre cada vector de fraude: [`checklists/fraude.md`](../../specs/002-identidad-billetera-pagos/checklists/fraude.md).

## 2. Después del merge: qué tiene que hacer cada uno en su equipo

Sin estos pasos **la API no arranca**: ahora exige variables nuevas.

1. Actualizar la rama y las dependencias (hay paquetes nuevos; `argon2` compila su binario al instalar):

   ```bash
   git pull origin develop
   pnpm install
   ```

2. Levantar los servicios (se agregó **Mailpit**, el buzón de correo de desarrollo) y aplicar las migraciones:

   ```bash
   docker compose up -d
   pnpm db:migrate
   ```

3. Completar `apps/api/.env` con las variables nuevas de `apps/api/.env.example` (bloques "Spec 2") y generar los
   secretos locales. Este comando agrega 4 líneas al final del `.env` (no lo corras dos veces):

   ```bash
   pnpm --filter api exec tsx scripts/generar-secretos.ts >> apps/api/.env
   ```

   Agrega también al `.env` la línea `REPORTS_DATABASE_URL` del `.env.example`: la usan las pruebas de integración.

4. En `apps/web/.env.local`, copiar las variables nuevas de `apps/web/.env.example` y poner en `WEB_PROXY_SECRETO`
   **el mismo valor** que quedó en `apps/api/.env`.

5. Crear tu administrador local (nunca hay una ruta HTTP para esto). Al entrar por primera vez la web te pedirá
   activar el 2FA:

   ```bash
   pnpm --filter api exec tsx scripts/crear-administrador.ts
   ```

6. Para correr el E2E por primera vez en tu equipo, instalar el navegador de Playwright:

   ```bash
   pnpm --filter web exec playwright install chromium
   ```

Los correos de desarrollo (verificación, recuperación) se ven en http://localhost:8025. CAPTCHA y Payphone usan
claves de prueba en local: no hace falta ninguna cuenta para desarrollar.

## 3. Qué cambia para los specs 3 y 4

Detalle en [`contratos.md`](contratos.md) §1, §2 y §6. Lo más importante:

- **Pruebas e2e con el guard real**: `crearAppDePrueba()` (`apps/api/test/ayudas/app-prueba.ts`) y
  `sesionDePrueba(app, { roles })` (`apps/api/test/ayudas/sesion-de-prueba.ts`). Ya no hace falta un guard falso.
  Para usuarios reales: `crearUsuario()` y `activar2faConCodigos()` en `apps/api/test/ayudas/fabricas-identidad.ts`.
- **Cobertura de rutas**: `apps/api/test/cobertura-rutas.e2e-spec.ts` falla si una ruta responde sin sesión. Una
  ruta pública nueva (p. ej. un webhook firmado) se agrega a su lista blanca en el PR, con revisión.
- **Operador y administrador necesitan 2FA**: sin él reciben 403 en todo salvo activarlo. En las pruebas,
  `sesionDePrueba` usa alcance `completo` por defecto.
- **La base de pruebas no se limpia**: el libro y la auditoría son de solo inserción. Cada prueba crea sus datos
  con correos y claves únicos (research §17). Para empezar de cero en local: `docker compose down -v`.
- **IP y dispositivo**: usa `@ClienteActual()` para auditar, no `request.ip` (detrás del proxy de la web).
- **Validación**: hay un pipe global; basta con `@Body({ schema })` de zod.
- **Web**: el navegador siempre llama a `/api/*` de la propia web. Usa `api()` de `apps/web/src/lib/api-cliente.ts`
  (renueva la sesión solo). Nunca llames a `onrender.com` desde el navegador.

**Daniel (Spec 3)**

- `BILLETERA_PORT` real ya existe y es global: reemplaza tu billetera SQL de prueba. Incluye `revertirPremio`.
- `usuario.id` es `uuid`: tus `usuario_id` pueden pasar a `@db.Uuid` con relación a `Usuario`.
- El guard solo protege HTTP: tu gateway de WebSocket autentica con su ticket. El `POST` del ticket va por el proxy.
- Un usuario sin correo verificado nunca tiene saldo, así que `debitarApuesta` lo rechaza sin que lo tengas que
  comprobar.

**Erick (Spec 4)**

- Reportes debe verificar el JWT con `JWT_PUBLIC_KEY` (EdDSA) y **rechazar tokens con `alc` distinto de
  `completo`**. Las demás claims son las del contrato 6, más `sid`.
- `reportes_lectura` no puede leer `credencial`, `segundo_factor`, `codigo_recuperacion`, `sesion` ni
  `enlace_correo` (a propósito). Puede leer `usuario`, `asiento`, `linea_asiento`, `cuenta_contable`,
  `intencion_pago`, `retiro` y `evento_auditoria`.
- `RIESGO_PORT`: los retiros lo inyectan con `@Optional()`. Cuando lo proveas en un módulo global, empieza a
  usarse solo. Si `requiereRevision`, el retiro va a revisión con tus `motivos`.
- `acreditarBono` lanza `UsuarioNoHabilitadoError` a usuarios sin verificar o suspendidos: no consumas el cupón.
- Eventos que emite el Spec 2 (tras el commit): `usuario.registrado`, `deposito.confirmado` (con `codigoCupon`) y
  `retiro.solicitado`.
- Revisa los archivos del Spec 1 que tocó este PR (lista en `specs/002-identidad-billetera-pagos/contracts/cambios-contratos.md` §5 a §7).

## 4. Staging: variables y servicios externos

Antes del merge (o justo después) alguien con acceso a Render y Vercel tiene que cargar las variables. El paso a
paso está en [`docs/despliegue.md`](../despliegue.md), sección "Variables y servicios del Spec 2". Resumen:

- **Render (API)**: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `TOTP_CLAVE_CIFRADO`, `WEB_PROXY_SECRETO`,
  `TURNSTILE_SECRET`, `RESEND_API_KEY`, `CORREO_REMITENTE`, `PAYPHONE_TOKEN`, `PAYPHONE_STORE_ID`.
- **Render (reportes)**: `JWT_PUBLIC_KEY` (cuando el Spec 4 la use).
- **Vercel (web)**: `WEB_PROXY_SECRETO` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

## 5. Decisiones y limitaciones conocidas

- **Un solo PR** en lugar de tres: se acordó para no esperar los merges intermedios.
- **CSP fija** en `apps/web/next.config.ts`, sin nonce: con `cacheComponents` un nonce obliga a renderizar cada
  página por petición.
- **Pantallas con sesión como componentes de cliente**, que llaman al proxy con `api()`.
- **Retiros simulados**: el sandbox de Payphone no paga hacia afuera; el pago se marca con referencia `SIM-…`.
- **Depósito con el navegador cerrado**: Payphone no permite consultar una venta por referencia; si el usuario no
  vuelve, la intención caduca a los 15 minutos y Payphone revierte el cobro a los 5.
- **Payphone exige registrar el dominio** de `responseUrl` en Payphone Developer; puede no admitir `localhost`. Si
  no lo admite, probar los depósitos reales en staging.
- **Pruebas recortadas por tiempo** (anotado en `tasks.md`): sin pruebas de componentes de la web, sin E2E de
  depósito ni de retiros (los cubren las de integración) y sin accesibilidad automática.
- **El skill `frontend-design` no está instalado** en `.claude/skills/` aunque `CLAUDE.md` lo pide: las pantallas
  siguen el estilo de "boleto" de la página de estado del Spec 1.
