---
description: "Lista de tareas del Spec 2: identidad, billetera y pagos"
---

# Tasks: Identidad, billetera y pagos

**Input**: Design documents from `/specs/002-identidad-billetera-pagos/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: la constitución (principio IV) exige pruebas primero en libro contable, billetera y pagos, con pruebas de
concurrencia, idempotencia y abuso, y al menos una prueba de integración por historia. Las tareas de prueba de cada
fase van antes que la implementación y deben fallar primero; la prueba y su implementación se confirman en el mismo
commit para que cada commit pase CI.

**Organization**: tareas agrupadas por historia de usuario, en el orden de entrega de los 3 PR del plan. La HU3
(guard y auditoría) va primero porque las demás la usan; la HU6 (2FA, P2) y la HU9 (P3) entran en el PR 1 porque el
2FA es obligatorio para operadores y administradores y el panel de usuarios es lo que crea operadores para el Spec 3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US9 = historias 1…9 de la spec)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias, configuración y servicios locales

- [ ] T001 Instalar en la API `jose`, `argon2`, `otpauth`, `qrcode`, `nodemailer`, `cookie-parser`, `@nestjs/event-emitter` y `@nestjs/schedule`, y como desarrollo `tsx`, `@types/nodemailer`, `@types/qrcode` y `@types/cookie-parser` (`apps/api/package.json`, `pnpm-lock.yaml`)
- [ ] T002 Escribir primero las pruebas de las variables nuevas de autenticación, correo y proxy (obligatorias, valores por defecto, `JWT_ACCESS_TTL` ≤ 900, `TOTP_CLAVE_CIFRADO` de 32 bytes, `SMTP_URL` obligatoria si `CORREO_TRANSPORTE=smtp`, `RESEND_API_KEY` si `resend`) en `apps/api/src/config/env.spec.ts` y luego agregarlas a `apps/api/src/config/env.ts` (contracts/configuracion.md); agregar valores de prueba (claves Ed25519 solo para CI, secreto de prueba de Turnstile, servicio Mailpit) a `.github/workflows/ci.yml` en el mismo commit para que CI no falle, y avisar en el PR que las variables deben existir en Render y Vercel antes del merge
- [ ] T003 [P] Documentar las variables en `apps/api/.env.example` (claves de prueba de Turnstile, Mailpit), `apps/web/.env.example` (`WEB_PROXY_SECRETO`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) y `specs/001-fundaciones-stack/contracts/configuracion.md`
- [ ] T004 [P] Agregar el servicio `mailpit` (`axllent/mailpit`, puertos 1025 y 8025, healthcheck) a `docker-compose.yml`
- [ ] T005 [P] Agregar la validación de las variables nuevas de la web (`WEB_PROXY_SECRETO`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) en `apps/web/src/lib/entorno.ts` con su prueba en `apps/web/src/lib/entorno.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema de identidad y auditoría, tokens, guard global, correo y proxy de la web

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase

- [ ] T006 Escribir en `apps/api/prisma/schema/identidad.prisma` los enums `Rol`, `EstadoUsuario` y `PropositoEnlace` y los modelos `Usuario`, `Credencial`, `SegundoFactor`, `CodigoRecuperacion`, `Sesion` y `EnlaceCorreo` según data-model.md (`@@map`/`@map`, `@db.Uuid`, índices y únicos)
- [ ] T007 Generar la migración `spec2_identidad` con `pnpm --filter api exec prisma migrate dev --name spec2_identidad` y agregar a su `migration.sql` el bloque `DO` que hace `REVOKE ALL` de `credencial`, `segundo_factor`, `codigo_recuperacion`, `sesion` y `enlace_correo` a `reportes_lectura` si el rol existe (`apps/api/prisma/migrations/<fecha>_spec2_identidad/migration.sql`, research §14)
- [ ] T008 Agregar el modelo `EventoAuditoria` a `identidad.prisma` y generar la migración `spec2_auditoria` con los disparadores `BEFORE UPDATE OR DELETE` y `BEFORE TRUNCATE` que lanzan excepción (`apps/api/prisma/migrations/<fecha>_spec2_auditoria/migration.sql`)
- [ ] T009 [P] Escribir primero `apps/api/src/auditoria/sanitizar.spec.ts` (claves sensibles anidadas, arreglos, valores no objeto) y luego `apps/api/src/auditoria/sanitizar.ts`
- [ ] T010 Escribir primero `apps/api/test/auditoria.e2e-spec.ts` (inserta con y sin `tx`, se revierte junto con un `tx` fallido, `UPDATE`/`DELETE`/`TRUNCATE` fallan, `datos` sanitizados) y luego `apps/api/src/auditoria/auditoria.service.ts` y `apps/api/src/auditoria/auditoria.module.ts` (global, provee `AUDITORIA_PORT`)
- [ ] T011 [P] Escribir primero `apps/api/src/identidad/http/cliente-http.spec.ts` (usa `x-cliente-ip` solo con `x-proxy-secreto` válido, comparación en tiempo constante, cae a `request.ip`) y luego `apps/api/src/identidad/http/cliente-http.ts` y el decorador `@ClienteActual()` (IP y dispositivo)
- [ ] T012 Crear `apps/api/src/identidad/http/throttler-por-cliente.guard.ts` (`getTracker` con la IP resuelta) con su prueba y reemplazar `ThrottlerGuard` por él en `apps/api/src/app.module.ts` (cambios-contratos §5)
- [ ] T013 [P] Escribir primero `apps/api/src/identidad/contrasenas.service.spec.ts` (Argon2id con los parámetros de research §4, verificación correcta e incorrecta, hash ficticio para correos inexistentes) y luego `apps/api/src/identidad/contrasenas.service.ts`
- [ ] T014 [P] Escribir primero `apps/api/src/identidad/tokens.service.spec.ts` (claims del contrato 6 más `sid` y `alc`, `exp`, firma alterada, `iss`/`aud` incorrectos, token de desafío 2FA de otro propósito rechazado) y luego `apps/api/src/identidad/tokens.service.ts` con `jose` y EdDSA
- [ ] T015 Agregar a `apps/api/src/identidad/tokens.service.ts` la revocación en Redis (`identidad:revocado-antes:<usuarioId>` con caducidad igual al acceso) y su prueba de integración en `apps/api/test/tokens-revocacion.e2e-spec.ts`
- [ ] T016 Crear `apps/api/src/identidad/permite-sin-segundo-factor.decorator.ts` y escribir primero `apps/api/test/guard.e2e-spec.ts` (sin token 401; token de cookie `acceso` o `Bearer`; revocado 401; `alc: activar-2fa` solo en rutas marcadas; `@Roles` con varios roles; 403 auditado como `acceso.denegado`; `@Publico` pasa); luego `apps/api/src/identidad/autenticacion.guard.ts` y su registro como `APP_GUARD` después del throttler en `apps/api/src/app.module.ts`, con `cookie-parser` en `apps/api/src/configurar-app.ts`
- [ ] T017 Crear `apps/api/test/ayudas/app-prueba.ts` (AppModule real, limpieza de las tablas del Spec 2 en orden, sin tocar el libro contable), `apps/api/test/ayudas/sesion-de-prueba.ts` (tokens reales por rol para los specs 2, 3 y 4) y `apps/api/test/ayudas/fabricas-identidad.ts` (usuario verificado, con 2FA, operador, administrador)
- [ ] T018 [P] Escribir primero `apps/api/src/identidad/captcha.service.spec.ts` (aprueba, rechaza, Turnstile caído = rechazo, `hostname` en producción) y luego `apps/api/src/identidad/captcha.service.ts`
- [ ] T019 [P] Crear `apps/api/src/identidad/correo/correo.port.ts` (`CORREO_PORT`), `smtp.adaptador.ts` (nodemailer), `resend.adaptador.ts` (fetch) y `plantillas.ts` (verificación, aviso de cuenta existente, recuperación), con la selección por `CORREO_TRANSPORTE` en `apps/api/src/identidad/correo/correo.module.ts` y la prueba contra Mailpit en `apps/api/test/correo.e2e-spec.ts` con `apps/api/test/ayudas/mailpit.ts`
- [ ] T020 Registrar `EventEmitterModule.forRoot()` y `ScheduleModule.forRoot()` en `apps/api/src/app.module.ts` y crear `apps/api/src/identidad/identidad.module.ts`
- [ ] T021 Escribir primero `apps/web/src/app/api/[...ruta]/route.test.ts` (reenvía método, cuerpo, cookies y `Set-Cookie`; agrega `x-cliente-ip`, `x-cliente-dispositivo` y `x-proxy-secreto`; rechaza no-`GET` con otro `Origin`; nunca reenvía cabeceras `x-proxy-*` del navegador) y luego `apps/web/src/app/api/[...ruta]/route.ts` (research §1)
- [ ] T022 [P] Crear `apps/web/src/lib/api-servidor.ts` (`llamarApi()` para componentes de servidor, con la cookie y la IP del cliente) con su prueba en `apps/web/src/lib/api-servidor.test.ts`
- [ ] T023 [P] Crear `apps/web/src/proxy.ts` con la CSP con nonce por petición (permite `challenges.cloudflare.com`) y su prueba en `apps/web/src/proxy.test.ts`; quitar el comentario pendiente de `apps/web/next.config.ts`
- [ ] T024 [P] Crear `apps/web/src/components/turnstile.tsx` (carga el script con el nonce, expone el token al formulario, accesible por teclado) con su prueba en `apps/web/src/components/turnstile.test.tsx`

**Checkpoint**: la API arranca con el guard global y la auditoría; la web reenvía `/api/*` con la sesión

---

## Phase 3: User Story 3 - Control de acceso por roles y auditoría (Priority: P1) 🎯 MVP — PR 1

**Goal**: denegación por defecto verificada en todas las rutas, auditoría consultable y credenciales fuera del alcance de reportes

**Independent Test**: recorrer todas las rutas sin sesión y con cada rol; ejecutar una acción sensible y ver su evento; intentar editarlo

### Tests for User Story 3 ⚠️

- [ ] T025 [P] [US3] Escribir `apps/api/test/cobertura-rutas.e2e-spec.ts`: recorre con `DiscoveryService` todas las rutas de la app y comprueba que sin sesión responden 401, salvo la lista blanca explícita de rutas públicas (research §12)
- [ ] T026 [P] [US3] Escribir `apps/api/test/reportes-credenciales.e2e-spec.ts`: con `REPORTS_DATABASE_URL`, leer `credencial`, `segundo_factor`, `codigo_recuperacion`, `sesion` y `enlace_correo` falla y leer `usuario` funciona (FR-064)

### Implementation for User Story 3

- [ ] T027 [US3] Agregar al final de `infra/postgres/usuario-solo-lectura.sql` el `REVOKE` de las tablas sensibles protegido con `to_regclass` (cambios-contratos §6, revisor Erick)
- [ ] T028 [US3] Documentar en `docs/equipo/contratos.md` §1 y §6 el proxy `/api/*`, `llamarApi()` y las claims `sid` y `alc` (cambios-contratos §3 y §4)

**Checkpoint**: la cobertura de rutas protege a los specs 3 y 4 desde su primer controlador

---

## Phase 4: User Story 1 - Registro con verificación de correo y mayoría de edad (Priority: P1) — PR 1

**Goal**: un visitante crea su cuenta, verifica su correo y queda como apostador

**Independent Test**: registrarse, verificar desde Mailpit y comprobar los rechazos de menor de edad, correo repetido y sin CAPTCHA

### Tests for User Story 1 ⚠️

- [ ] T029 [P] [US1] Escribir `apps/api/src/identidad/politicas.spec.ts`: edad con la fecha del servidor (cumple hoy), contraseña de 12 a 128 caracteres y fuera de la lista común, normalización del correo
- [ ] T030 [P] [US1] Escribir `apps/api/test/registro.e2e-spec.ts`: registro válido crea usuario `PENDIENTE_VERIFICACION` con rol `APOSTADOR`, billetera y correo; menor y sin declaración rechazados; correo repetido responde igual y envía el aviso; registros simultáneos con el mismo correo crean uno; sin CAPTCHA rechazado; enlace válido verifica y no se reutiliza; enlace caducado; reenvío limitado a 3 por hora; evento `usuario.registrado` y auditoría

### Implementation for User Story 1

- [ ] T031 [P] [US1] Crear `apps/api/src/identidad/politicas.ts` y `apps/api/src/identidad/contrasenas-comunes.txt` (10 000 contraseñas comunes)
- [ ] T032 [US1] Crear `apps/api/src/identidad/enlaces.service.ts` (token aleatorio, hash SHA-256, caducidad, un solo uso con `UPDATE … WHERE usado_en IS NULL`)
- [ ] T033 [US1] Crear `apps/api/src/identidad/registro.service.ts` (registro en una transacción con usuario, credencial y, cuando exista el libro contable, billetera; correo y evento tras el commit) y las rutas `POST /identidad/registro`, `POST /identidad/correo/verificar` y `POST /identidad/correo/reenviar` en `apps/api/src/identidad/identidad.controller.ts` con esquemas zod `.strict()`
- [ ] T034 [P] [US1] Crear las pantallas `apps/web/src/app/(cuenta)/registro/page.tsx` y `apps/web/src/app/(cuenta)/verificar-correo/page.tsx` con el skill `frontend-design` y sus pruebas en `apps/web/src/app/(cuenta)/registro/registro.test.tsx`

**Checkpoint**: se pueden crear cuentas verificadas

---

## Phase 5: User Story 2 - Inicio de sesión seguro y protección contra fuerza bruta (Priority: P1) — PR 1

**Goal**: sesión corta con renovación rotativa, cierre, bloqueo tras intentos fallidos y recuperación de contraseña

**Independent Test**: entrar, renovar, cerrar sesión, fallar 5 veces, reutilizar una renovación y recuperar la contraseña

### Tests for User Story 2 ⚠️

- [ ] T035 [P] [US2] Escribir `apps/api/test/sesion.e2e-spec.ts`: inicio correcto deja cookies `httpOnly` con los `Path` de contracts/api-rest.md; mensaje genérico con correo inexistente o contraseña incorrecta; 5 fallos bloquean 15 minutos aun con la contraseña correcta y se audita; renovación rota y la anterior no sirve; reutilización tras 10 s revoca todas las sesiones; dos renovaciones simultáneas responden 409 sin revocar; cerrar sesión invalida la renovación; cuenta suspendida rechazada
- [ ] T036 [P] [US2] Escribir `apps/api/test/recuperacion.e2e-spec.ts`: respuesta igual exista o no el correo; enlace de 1 hora y un solo uso; cambiar la contraseña cierra todas las sesiones, revoca el acceso y se audita

### Implementation for User Story 2

- [ ] T037 [US2] Crear `apps/api/src/identidad/sesiones.service.ts` (inicio con bloqueo, emisión de cookies, renovación rotativa con `FOR UPDATE` y ventana de 10 s, cierre, revocación de todas) y `apps/api/src/identidad/cookies.ts`
- [ ] T038 [US2] Agregar las rutas `POST /identidad/sesion`, `/sesion/renovar`, `/sesion/cerrar`, `GET /identidad/yo`, `POST /identidad/contrasena/olvido` y `/contrasena/restablecer` con límites de frecuencia de 5 por minuto en `apps/api/src/identidad/identidad.controller.ts`
- [ ] T039 [P] [US2] Crear `apps/web/src/lib/sesion-cliente.ts` (renueva una vez ante 401 y reintenta; ante 409 espera y reintenta) con su prueba en `apps/web/src/lib/sesion-cliente.test.ts`
- [ ] T040 [P] [US2] Crear las pantallas `apps/web/src/app/(cuenta)/iniciar-sesion/page.tsx`, `apps/web/src/app/(cuenta)/recuperar/page.tsx` y `apps/web/src/app/(cuenta)/restablecer/page.tsx` con sus pruebas

**Checkpoint**: criterio de cierre de la F1 (fuerza bruta bloqueada)

---

## Phase 6: User Story 6 - Segundo factor de autenticación (Priority: P2) — PR 1

**Goal**: activar el 2FA con QR y códigos de recuperación; exigirlo al entrar y obligatorio para operador y administrador

**Independent Test**: activar el 2FA, entrar con código, usar un código de recuperación dos veces, entrar como operador sin 2FA

### Tests for User Story 6 ⚠️

- [ ] T041 [P] [US6] Escribir `apps/api/src/identidad/segundo-factor.service.spec.ts`: ventana ±1 periodo, reutilización del mismo periodo rechazada, cifrado y descifrado del secreto, códigos de recuperación de un solo uso
- [ ] T042 [P] [US6] Escribir `apps/api/test/segundo-factor.e2e-spec.ts`: activación pendiente hasta confirmar; 10 códigos mostrados una vez; inicio de sesión responde `REQUIERE_2FA` y `/sesion/2fa` lo completa; 5 códigos incorrectos bloquean; desactivar exige código y el operador no puede; operador sin 2FA recibe `alc: activar-2fa` y solo puede activar, ver `yo` y cerrar sesión

### Implementation for User Story 6

- [ ] T043 [US6] Crear `apps/api/src/identidad/segundo-factor.service.ts` (`otpauth`, AES-256-GCM con `TOTP_CLAVE_CIFRADO`, QR con `qrcode`, códigos con SHA-256)
- [ ] T044 [US6] Agregar el desafío 2FA a `apps/api/src/identidad/sesiones.service.ts` y las rutas `POST /identidad/sesion/2fa`, `/2fa/activacion`, `/2fa/activacion/confirmar` y `/2fa/desactivar` en `apps/api/src/identidad/identidad.controller.ts`
- [ ] T045 [P] [US6] Crear el paso de código en `apps/web/src/app/(cuenta)/iniciar-sesion/codigo/page.tsx` y la pantalla `apps/web/src/app/(cuenta)/seguridad/page.tsx` (QR, confirmación, códigos con opción de copiar) con sus pruebas; redirigir a `seguridad` cuando `alcance` es `activar-2fa`

**Checkpoint**: las cuentas con privilegios no entran sin 2FA

---

## Phase 7: User Story 9 - Administración de usuarios, roles y auditoría (Priority: P3) — PR 1

**Goal**: el administrador gestiona roles y suspensiones y consulta la auditoría

**Independent Test**: dar el rol de operador, suspender una cuenta y filtrar la auditoría por ese usuario

### Tests for User Story 9 ⚠️

- [ ] T046 [P] [US9] Escribir `apps/api/test/usuarios-admin.e2e-spec.ts`: cambio de rol exige 2FA, se audita con el anterior y el nuevo y revoca el acceso; el último administrador no se quita el rol ni se suspende; no se promueve a quien tiene saldo o retiros pendientes (cuando exista la billetera); suspender revoca de inmediato; apostador y operador reciben 403 en todas las rutas `/admin/*`; filtros y paginación de la auditoría

### Implementation for User Story 9

- [ ] T047 [US9] Crear `apps/api/src/identidad/usuarios-admin.service.ts` y `apps/api/src/identidad/usuarios-admin.controller.ts` (`/admin/usuarios`, roles, suspensión)
- [ ] T048 [US9] Crear `apps/api/src/auditoria/auditoria.controller.ts` (`GET /admin/auditoria` con paginación por cursor)
- [ ] T049 [P] [US9] Crear `apps/api/scripts/crear-administrador.ts` (pide correo y contraseña por la terminal, crea un administrador verificado)
- [ ] T050 [P] [US9] Crear las pantallas `apps/web/src/app/admin/usuarios/page.tsx`, `apps/web/src/app/admin/usuarios/[id]/page.tsx` y `apps/web/src/app/admin/usuarios/auditoria/page.tsx` con sus pruebas
- [ ] T051 [US9] Escribir el E2E `apps/web/e2e/identidad.spec.ts` (registro → verificación con la API de Mailpit → inicio de sesión → activación de 2FA → administrador asigna operador) y ajustar `apps/web/playwright.config.ts` para levantar Mailpit
- [ ] T052 [US9] Marcar las tareas del PR 1 en este archivo y actualizar `specs/README.md`

**Checkpoint**: PR 1 listo; desbloquea a los specs 3 y 4

---

## Phase 8: User Story 4 - Billetera con saldo real y de bono derivados del libro contable (Priority: P1) — PR 2

**Goal**: libro contable de doble entrada inmutable que implementa `BilleteraPort`

**Independent Test**: débitos, premios, reembolsos y bonos cuadran con la suma de los asientos; 50 débitos simultáneos dejan el saldo exacto; una clave repetida no duplica

### Tests for User Story 4 ⚠️

- [ ] T053 [P] [US4] Escribir `apps/api/src/billetera/asientos.spec.ts`: líneas de cada operación de la tabla de data-model.md, suma cero, montos positivos con 2 decimales, monto cero o negativo rechazado
- [ ] T054 [P] [US4] Escribir `apps/api/test/libro-contable.e2e-spec.ts`: `UPDATE`/`DELETE`/`TRUNCATE` de `asiento` y `linea_asiento` fallan; un asiento que no suma cero falla al confirmar; idempotencia con la misma clave devuelve `creado: false`; misma clave con otro monto lanza `ConflictoIdempotenciaError`; débito revertido junto con el `tx` de quien llama; saldo real y bono separados
- [ ] T055 [P] [US4] Escribir `apps/api/test/billetera-concurrencia.e2e-spec.ts`: 100.00 de saldo y 20 débitos simultáneos de 10.00 → 10 aceptados y saldo 0.00; 50 débitos simultáneos dejan el saldo exacto al centavo (SC-002); `revertirPremio` deja saldo negativo y es la única que puede
- [ ] T056 [P] [US4] Escribir `apps/api/test/billetera-rutas.e2e-spec.ts`: saldos y movimientos paginados con saldo resultante; no existe ruta ni método que fije o edite un saldo (FR-044)

### Implementation for User Story 4

- [ ] T057 [US4] Agregar `revertirPremio` y `ConflictoIdempotenciaError` a `apps/api/src/contracts/billetera.port.ts` y las claves nuevas a `docs/equipo/contratos.md` §2 (cambios-contratos §1 y §2, revisor Daniel)
- [ ] T058 [US4] Agregar los enums `TipoCuenta` y `TipoAsiento` y los modelos `Billetera`, `CuentaContable`, `Asiento` y `LineaAsiento` a `identidad.prisma` y generar la migración `spec2_libro_contable` con los disparadores de inmutabilidad, la restricción diferida de suma cero, los checks y las tres cuentas del sistema (`apps/api/prisma/migrations/<fecha>_spec2_libro_contable/migration.sql`)
- [ ] T059 [US4] Crear `apps/api/src/billetera/asientos.ts` y `apps/api/src/billetera/libro-contable.service.ts` (bloqueo `FOR UPDATE` de `billetera`, idempotencia, comprobación de saldo, inserción de cabecera y líneas)
- [ ] T060 [US4] Crear `apps/api/src/billetera/billetera.service.ts` (`BILLETERA_PORT` con las siete operaciones) y `apps/api/src/billetera/billetera.module.ts` (global); crear la billetera y sus cuentas en el registro (`apps/api/src/identidad/registro.service.ts`) y una migración de datos para los usuarios ya existentes
- [ ] T061 [US4] Crear `apps/api/src/billetera/billetera.controller.ts` (`GET /billetera`, `/billetera/movimientos`) y activar en `usuarios-admin.service.ts` la regla de no promover con saldo
- [ ] T062 [P] [US4] Crear la pantalla `apps/web/src/app/billetera/page.tsx` (saldos real y de bono, movimientos con paginación) con su prueba

**Checkpoint**: el Spec 3 puede cambiar su doble de billetera por la real

---

## Phase 9: User Story 5 - Depósito con la pasarela confirmado por el servidor (Priority: P1) — PR 2

**Goal**: depositar con Payphone sandbox y acreditar solo tras la confirmación servidor a servidor

**Independent Test**: depositar en el sandbox; repetir la confirmación, volver sin pagar y alterar el monto devuelto sin que se acredite de más

### Tests for User Story 5 ⚠️

- [ ] T063 [P] [US5] Escribir `apps/api/src/pagos/centavos.spec.ts` y `apps/api/src/pagos/verificar-confirmacion.spec.ts`: conversión exacta a centavos; aprobada solo con `statusCode` 3, `Approved`, monto, moneda y referencia iguales; cada discrepancia con su motivo
- [ ] T064 [P] [US5] Escribir `apps/api/src/pagos/payphone.cliente.spec.ts`: cuerpo de Prepare en centavos con `responseUrl` y `cancellationUrl`; Confirm con `id` y `clientTxId`; Reverse; errores HTTP y de red (con `fetch` simulado)
- [ ] T065 [P] [US5] Escribir `apps/api/test/depositos.e2e-spec.ts` con `apps/api/test/ayudas/pasarela-doble.ts`: sin verificar o con rol operador rechazado; intención con referencia única; confirmación acredita una vez aunque se repita 10 veces (SC-003); confirmaciones simultáneas acreditan una vez; monto, moneda o referencia distintos se rechazan, se auditan y piden reverso; cancelada queda fallida; regreso sin confirmación no cambia el saldo; `transactionId` de otra intención rechazado; evento `deposito.confirmado` con el cupón; método de pago guardado sin duplicar; caducidad a los 15 minutos

### Implementation for User Story 5

- [ ] T066 [US5] Agregar los enums `EstadoIntencionPago` y `TipoMetodoPago` y los modelos `IntencionPago` y `MetodoPago` a `identidad.prisma` y generar la migración `spec2_pagos` con el disparador de columnas congeladas (`apps/api/prisma/migrations/<fecha>_spec2_pagos/migration.sql`)
- [ ] T067 [US5] Crear `apps/api/src/pagos/centavos.ts`, `apps/api/src/pagos/verificar-confirmacion.ts`, `apps/api/src/pagos/pasarela.port.ts` y `apps/api/src/pagos/payphone.cliente.ts`
- [ ] T068 [US5] Crear `apps/api/src/pagos/depositos.service.ts` (Prepare, Confirm fuera de la transacción, acreditación con bloqueo e idempotencia, reverso por discrepancia, evento tras el commit) y `apps/api/src/pagos/pagos.controller.ts` (`POST /pagos/depositos`, `/depositos/confirmar`, `GET /pagos/depositos/:id`)
- [ ] T069 [US5] Crear `apps/api/src/pagos/caducidad.tarea.ts` (cada minuto marca `CADUCADA` las intenciones vencidas) y `apps/api/src/pagos/pagos.module.ts`
- [ ] T070 [P] [US5] Crear las pantallas `apps/web/src/app/billetera/depositar/page.tsx` (monto, cupón opcional, redirección a `urlPago`) y `apps/web/src/app/billetera/deposito/retorno/page.tsx` ("Procesando", confirma y muestra el resultado o permite reintentar) con sus pruebas
- [ ] T071 [US5] Crear la pasarela falsa `apps/web/e2e/pasarela-falsa.ts` (Prepare, página de pago, redirección y Confirm), arrancarla en el `globalSetup` de `apps/web/playwright.config.ts` y escribir `apps/web/e2e/deposito.spec.ts`
- [ ] T072 [US5] Marcar las tareas del PR 2 en este archivo

**Checkpoint**: criterio de cierre de la F2 (concurrencia y doble confirmación); PR 2 listo

---

## Phase 10: User Story 7 - Retiro al mismo titular con revisión sobre un umbral (Priority: P2) — PR 3

**Goal**: retirar saldo real con 2FA, al método de un depósito, con pago automático bajo el umbral

**Independent Test**: retiro bajo el umbral pagado al instante; sin 2FA, a otro método, sobre el saldo y sobre el umbral

### Tests for User Story 7 ⚠️

- [ ] T073 [P] [US7] Escribir `apps/api/test/retiros.e2e-spec.ts`: sin 2FA, sin código válido, sin verificar, sin depósito previo o con rol operador rechazado; método de otro usuario rechazado; monto sobre el saldo real o con saldo negativo rechazado; bono no retirable; bajo el umbral queda `PAGADO` con `SIM-` y dos asientos; sobre el umbral o con `RIESGO_PORT` que pide revisión queda `PENDIENTE_REVISION` con motivos; sin `RIESGO_PORT` se aplica solo el umbral; dos solicitudes simultáneas que superan el saldo aceptan una; la misma `claveSolicitud` no duplica; evento `retiro.solicitado`

### Implementation for User Story 7

- [ ] T074 [US7] Agregar el enum `EstadoRetiro` y el modelo `Retiro` a `identidad.prisma` y generar la migración `spec2_retiros` con el disparador de columnas congeladas (`apps/api/prisma/migrations/<fecha>_spec2_retiros/migration.sql`); agregar `RETIRO_MIN`, `RETIRO_MAX` y `RETIRO_UMBRAL_REVISION` a `apps/api/src/config/env.ts` con sus pruebas si no se agregaron en T002
- [ ] T075 [US7] Crear `apps/api/src/retiros/retiros.service.ts` (validaciones, `RIESGO_PORT` con `@Optional()`, reserva, pago automático y evento tras el commit), `apps/api/src/retiros/retiros.controller.ts` y `apps/api/src/retiros/retiros.module.ts`; agregar `GET /billetera/metodos-retiro` a `apps/api/src/billetera/billetera.controller.ts`
- [ ] T076 [P] [US7] Crear la pantalla `apps/web/src/app/billetera/retirar/page.tsx` (monto, método, código 2FA, aviso de revisión) con su prueba

**Checkpoint**: los apostadores retiran ganancias de forma segura

---

## Phase 11: User Story 8 - Revisión de retiros por el administrador (Priority: P2) — PR 3

**Goal**: aprobar o rechazar los retiros pendientes con auditoría

**Independent Test**: aprobar uno, rechazar otro y aprobar dos veces el mismo

### Tests for User Story 8 ⚠️

- [ ] T077 [P] [US8] Escribir `apps/api/test/retiros-admin.e2e-spec.ts`: aprobar exige 2FA, deja `PAGADO` con referencia simulada y asiento de pago; rechazar devuelve el saldo con su motivo; aprobar o rechazar dos veces (o a la vez) no repite efectos; un administrador no resuelve su propio retiro; apostador y operador reciben 403

### Implementation for User Story 8

- [ ] T078 [US8] Agregar la aprobación y el rechazo a `apps/api/src/retiros/retiros.service.ts` y crear `apps/api/src/retiros/retiros-admin.controller.ts` (`GET /admin/retiros`, `POST /admin/retiros/:id/aprobacion`, `/rechazo`)
- [ ] T079 [P] [US8] Crear la pantalla `apps/web/src/app/admin/retiros/page.tsx` (pendientes con usuario, motivos e historial; aprobar o rechazar con código 2FA) con su prueba
- [ ] T080 [US8] Escribir el E2E `apps/web/e2e/retiro.spec.ts` (retiro bajo el umbral pagado, retiro sobre el umbral aprobado por el administrador, casos de abuso)

**Checkpoint**: PR 3 listo

---

## Phase 12: Polish & Cross-Cutting Concerns

- [ ] T081 [P] Revisar la accesibilidad de todas las pantallas del spec (navegación por teclado, foco visible, contraste, 360 px) y agregar comprobaciones automáticas con `@axe-core/playwright` en `apps/web/e2e/accesibilidad.spec.ts` (SC-009)
- [ ] T082 [P] Repasar la tabla de vectores de fraude de spec.md y verificar que cada fila tiene su prueba; dejar la referencia a la prueba en `specs/002-identidad-billetera-pagos/checklists/fraude.md`
- [ ] T083 Correr `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:e2e`, seguir `quickstart.md` de punta a punta y actualizar `specs/README.md` a "En revisión"

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → historias.
- **US3** después de Foundational; **US1** después de US3 (usa la lista blanca de rutas públicas).
- **US2** depende de US1 (necesita usuarios). **US6** depende de US2 (inicio de sesión). **US9** depende de US6
  (el cambio de rol exige 2FA).
- **US4** depende de Foundational y de US1 (billetera creada en el registro). **US5** depende de US4.
- **US7** depende de US5 (método de pago) y de US6 (2FA). **US8** depende de US7.
- **Polish** al final.

### Within Each User Story

- Las pruebas primero, y deben fallar.
- Modelos y migraciones → servicios → controladores → pantallas → E2E.

### Parallel Opportunities

- Fase 1: T003, T004 y T005 en paralelo tras T002.
- Fase 2: T009, T011, T013, T014, T018 y T019 en paralelo; T021 a T024 (web) en paralelo con la API.
- En cada historia, las tareas de prueba [P] y las pantallas [P] en paralelo con los servicios.

## Parallel Example: User Story 4

```text
T053 asientos.spec.ts           (puro)
T054 libro-contable.e2e-spec.ts (integración)
T055 billetera-concurrencia.e2e-spec.ts
T056 billetera-rutas.e2e-spec.ts
→ luego T057 → T058 → T059 → T060 → T061, con T062 (pantalla) en paralelo
```

## Implementation Strategy

### MVP (PR 1)

Fases 1 a 7: identidad, guard, auditoría, 2FA y usuarios. Es lo que desbloquea a Daniel (guard real y modelo
`Usuario`) y a Erick (token verificable por reportes).

### Incremental Delivery

1. PR 1 → los specs 3 y 4 cambian su guard de prueba por `sesion-de-prueba.ts`.
2. PR 2 → el Spec 3 cambia su billetera SQL de prueba por `BILLETERA_PORT` real.
3. PR 3 → retiros completos; el Spec 4 conecta `RIESGO_PORT`.

## Mapa de commits

Los commits siguen la división acordada con el equipo; cada uno agrupa estas tareas:

| Commit | Tareas |
|--------|--------|
| 1.1 dependencias de identidad y eventos | T001 |
| 1.2 variables de entorno de autenticación y correo | T002, T003, T005 |
| 1.3 Mailpit | T004 |
| 1.4 modelo de usuarios, roles y sesiones | T006, T007 (sin el `REVOKE`) |
| 1.5 tabla de auditoría append-only | T008 |
| 1.6 ocultar credenciales al usuario de reportes | `REVOKE` de T007, T026, T027 |
| 2.1 registro de auditoría | T009, T010 |
| 3.1 Argon2 | T013 |
| 3.2 JWT EdDSA | T014, T015 |
| 3.3 guard global | T011, T012, T016, T020, T025 |
| 3.4 guard de prueba reutilizable | T017 |
| 3.5 registro con mayoría de edad y CAPTCHA | T018, T029, T031, T033 (registro), parte de T030 |
| 3.6 verificación de correo | T019, T032, T033 (verificación y reenvío), resto de T030 |
| 3.7 login y bloqueo | T035 (inicio y bloqueo), T037, T038 (sesión) |
| 3.8 refresh rotativo y cierre | T035 (renovación y cierre), T036, T038 (recuperación) |
| 3.9 2FA TOTP | T041 a T044 |
| 3.10 administración de usuarios y roles | T046 a T049 |
| 4.1 proxy de sesión | T021, T022, T023, T028 |
| 4.2 registro y verificación (web) | T024, T034 |
| 4.3 inicio de sesión y 2FA (web) | T039, T040, T045 |
| 4.4 administración de usuarios (web) | T050 |
| 4.5 E2E de identidad | T051 |
| 4.6 cierre del PR 1 | T052 |
| 5.1 ledger | T058 |
| 5.2 asientos y saldos | T053, T054, T059 |
| 5.3 débito con bloqueo | T055 (concurrencia), parte de T060 |
| 5.4 premio y reembolso | resto de T060 |
| 5.5 bono y conversión | resto de T060 |
| 5.6 revertirPremio | T057 y su prueba de T055 |
| 5.7 módulo y consulta de saldos | T061, T062 |
| 5.8 el ledger no se edita | T056 |
| 6.1 variables de Payphone | parte de T002 para `PAYPHONE_*` y `DEPOSITO_*` si no entraron en 1.2 |
| 6.2 intenciones y depósitos | T066 |
| 6.3 cliente de Payphone | T063, T064, T067 |
| 6.4 intención de pago | T068 (Prepare), parte de T065 |
| 6.5 confirmación servidor a servidor | T068 (Confirm), T069, resto de T065 |
| 6.6 billetera y depósito (web) | T070 |
| 6.7 E2E de depósito | T071 |
| 6.8 cierre del PR 2 | T072 |
| 7.1 retiros y umbral | T074 |
| 7.2 solicitud de retiro | T073, T075 |
| 7.3 aprobación por el administrador | T077, T078 |
| 7.4 pantalla de retiro | T076 |
| 7.5 administración de retiros | T079 |
| 7.6 E2E de retiros | T080 |
| 7.7 cierre del spec | T081, T082, T083 |

La pantalla de la web de cada historia va en el bloque 4 (PR 1) o al final de su bloque (PR 2 y 3), como en la
división acordada; las tareas siguen agrupadas por historia para que cada una se pueda probar por separado.
