# Implementation Plan: Identidad, billetera y pagos

**Branch**: `feature/spec-2` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-identidad-billetera-pagos/spec.md`

## Summary

Construir en `apps/api` la identidad y el acceso, que son el contrato del que dependen los demás specs:

- Registro con verificación de correo y recuperación de contraseña.
- Sesión con JWT EdDSA en cookies `httpOnly` y renovación rotativa.
- 2FA TOTP, bloqueo por intentos fallidos y CAPTCHA.
- Guard global de denegación por defecto con roles, y auditoría de solo inserción.

Después, la billetera con un libro contable de doble entrada protegido por disparadores de PostgreSQL, que implementa
`BilleteraPort` con bloqueo de fila e idempotencia. Sobre ella van los depósitos con Payphone (Prepare,
confirmación servidor a servidor dentro de los 5 minutos y validación de monto, moneda y referencia) y los retiros
al mismo titular, con reserva en el libro, pago automático bajo el umbral y revisión del administrador sobre él.

En `apps/web` van las pantallas de acceso, billetera, depósito, retiro y administración, más un proxy de `/api/*`
que resuelve la sesión entre los dominios de Vercel y Render.

## Technical Context

**Language/Version**: TypeScript 6.0 sobre Node.js 22 LTS (`apps/api`, `apps/web`, `packages/shared`)

**Primary Dependencies**:
- Ya existentes: NestJS 12 (ESM), Prisma 7, zod, ioredis y `@nestjs/throttler`.
- Nuevas en la API: `jose`, `argon2`, `otpauth`, `qrcode`, `nodemailer`, `cookie-parser`, `@nestjs/event-emitter`
  y `@nestjs/schedule`, más `tsx` (desarrollo).
- Nuevas en la web: ninguna. Turnstile se carga con un componente propio.

**Storage**:
- PostgreSQL 17 con las tablas de `identidad.prisma`. Los disparadores de inmutabilidad y de suma cero, y los
  `REVOKE`, van en SQL de las migraciones.
- Redis 7 para la revocación de tokens y el rate limiting.

**Testing**:
- Vitest para reglas puras: política de contraseñas, edad, sanitizador, centavos, comparación de la confirmación y
  TOTP.
- Vitest + Supertest contra PostgreSQL y Redis reales, para:
  - el guard y la cobertura de rutas;
  - la concurrencia y la idempotencia del libro contable;
  - la inmutabilidad;
  - los depósitos con un doble de la pasarela;
  - los retiros y el bloqueo;
  - la reutilización de la renovación;
  - el acceso de reportes.
- Vitest + Testing Library para los formularios de la web.
- Playwright con Mailpit y una pasarela falsa.

**Target Platform**: Render (API) y Vercel (web)

**Project Type**: Monorepo web. Este spec toca `apps/api` y `apps/web`.

**Performance Goals**:
- Acreditación de un depósito en ≤ 10 s desde el regreso (SC-004).
- Inicio de sesión p95 < 1 s, incluido Argon2.
- 50 débitos simultáneos de una billetera sin error de saldo (SC-002).

**Constraints**:
- Payphone solo en sandbox, con confirmación en ≤ 5 minutos y sin pagos salientes.
- Planes gratuitos: Render puede bloquear el SMTP saliente.
- Sin Java ni Rust, ni siquiera en bindings: por eso `argon2` y no `@node-rs/argon2`.

**Scale/Scope**:
- Escala de demostración: cientos de usuarios y miles de asientos.
- 9 historias de usuario, 68 requisitos funcionales y 3 PR.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Seguridad y antifraude**:
  - El spec trae la tabla de vectores de fraude y cada vector tiene una prueba obligatoria.
  - El guard global deniega por defecto y aplica `@Roles` por ruta. Una prueba recorre todas las rutas registradas
    (research §12).
  - Se auditan todas las acciones sensibles listadas en `contracts/api-rest.md`.
  - Los secretos de Payphone, JWT, TOTP, Turnstile y el proxy solo viven en el servidor.
  - La confirmación de Payphone es servidor a servidor.
  - Las credenciales quedan fuera del alcance de reportes (research §14).
- [x] **II. Integridad financiera**:
  - El libro es de doble entrada, con disparadores contra `UPDATE`, `DELETE` y `TRUNCATE` y una restricción
    diferida de suma cero.
  - El saldo se calcula a partir de las líneas.
  - Cada operación bloquea `billetera` con `FOR UPDATE` dentro del `tx` de quien llama.
  - Hay idempotencia por `clave_idempotencia`, por `payphone_transaccion_id` y por la `claveSolicitud` del retiro.
  - Saldo real y saldo de bono van en cuentas separadas.
  - Un depósito solo se acredita si monto, moneda y referencia coinciden con la intención.
- [x] **III. Servidor como autoridad**:
  - La web solo envía intenciones (monto, código) y muestra los montos que devuelve la API.
  - La edad, la caducidad de los enlaces, el bloqueo y la caducidad de las intenciones usan el reloj del servidor.
  - El regreso de Payphone no acredita nada.
- [x] **IV. Pruebas primero**: cada tarea de libro contable, pagos y retiros empieza con su prueba en rojo. Las
  pruebas de concurrencia (SC-002), idempotencia (SC-003) y abuso (tabla de vectores) están en `tasks.md` antes de
  su implementación.
- [x] **V. Tiempo real**: no aplica directamente. Los eventos de dominio se emiten después del commit, y quien
  escucha (Spec 4) es idempotente.
- [x] **VI. Simplicidad**:
  - Solo se usan las tres apps. El proxy es un route handler de la web, no un servicio nuevo.
  - Reportes sigue en solo lectura y además pierde el acceso a las credenciales.
  - La complejidad extra está justificada abajo.
- [x] **VII. UX**: las pantallas se diseñan mobile-first desde 360 px, con WCAG 2.1 AA y el skill `frontend-design`.
  Las acciones se nombran por lo que hacen ("Crear cuenta", "Depositar", "Solicitar retiro").

**Re-evaluación post-diseño**: sin cambios; todas las compuertas siguen en verde. El diseño agrega cambios a
contratos (`contracts/cambios-contratos.md`) acordados por la vía de `contratos.md`.

## Project Structure

### Documentation (this feature)

```text
specs/002-identidad-billetera-pagos/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-rest.md             # rutas, acceso, cookies y acciones de auditoría
│   ├── cambios-contratos.md    # revertirPremio, claims, proxy, throttler, script de reportes
│   └── configuracion.md        # variables de entorno nuevas
├── checklists/requirements.md
└── tasks.md                    # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/schema/identidad.prisma           # modelos del data-model.md
├── prisma/migrations/<fecha>_spec2_*/       # tablas, disparadores, cuentas del sistema y REVOKE
├── scripts/crear-administrador.ts
├── src/
│   ├── contracts/billetera.port.ts          # + revertirPremio y ConflictoIdempotenciaError (PR 2)
│   ├── auditoria/
│   │   ├── sanitizar.ts                     # quita secretos de `datos` (puro)
│   │   ├── auditoria.service.ts             # AUDITORIA_PORT
│   │   └── auditoria.controller.ts          # GET /admin/auditoria
│   ├── identidad/
│   │   ├── http/cliente-http.ts             # resolutor de IP y dispositivo (x-cliente-ip + secreto)
│   │   ├── http/throttler-por-cliente.guard.ts
│   │   ├── politicas.ts                     # contraseña, edad, correo (puro)
│   │   ├── contrasenas.service.ts           # Argon2id
│   │   ├── tokens.service.ts                # JWT EdDSA, desafío 2FA, revocación en Redis
│   │   ├── autenticacion.guard.ts           # APP_GUARD (contrato 1)
│   │   ├── captcha.service.ts               # Turnstile
│   │   ├── correo/                          # CORREO_PORT, adaptadores SMTP y Resend, plantillas
│   │   ├── registro.service.ts              # registro, verificación, recuperación
│   │   ├── sesiones.service.ts              # inicio, bloqueo, renovación rotativa, cierre
│   │   ├── segundo-factor.service.ts        # TOTP cifrado, códigos de recuperación
│   │   ├── identidad.controller.ts          # /identidad/*
│   │   └── usuarios-admin.controller.ts     # /admin/usuarios/*
│   ├── billetera/
│   │   ├── asientos.ts                      # armado de líneas por operación (puro)
│   │   ├── libro-contable.service.ts        # bloqueo, idempotencia, saldo, inserción
│   │   ├── billetera.service.ts             # BILLETERA_PORT
│   │   └── billetera.controller.ts          # /billetera/*
│   ├── pagos/
│   │   ├── pasarela.port.ts                 # PASARELA_PORT
│   │   ├── payphone.cliente.ts              # Prepare, Confirm, Reverse
│   │   ├── centavos.ts                      # Decimal ⇄ centavos (puro)
│   │   ├── verificar-confirmacion.ts        # monto, moneda, referencia y estado (puro)
│   │   ├── depositos.service.ts
│   │   ├── caducidad.tarea.ts               # @nestjs/schedule, cada minuto
│   │   └── pagos.controller.ts              # /pagos/*
│   └── retiros/
│       ├── retiros.service.ts               # solicitud, pago automático, aprobación y rechazo
│       ├── retiros.controller.ts            # /retiros
│       └── retiros-admin.controller.ts      # /admin/retiros
└── test/
    ├── ayudas/sesion-de-prueba.ts           # tokens reales por rol para los specs 2, 3 y 4
    ├── ayudas/pasarela-doble.ts
    └── *.e2e-spec.ts                        # guard, rutas, sesión, 2FA, libro, concurrencia, depósitos, retiros, reportes
apps/web/
├── src/proxy.ts                             # CSP con nonce (Next.js 16)
├── src/app/api/[...ruta]/route.ts           # proxy hacia la API (research §1)
├── src/lib/api-servidor.ts                  # llamarApi() desde componentes de servidor
├── src/components/turnstile.tsx
├── src/app/(cuenta)/                        # registro, verificar-correo, iniciar-sesion, recuperar, restablecer, seguridad
├── src/app/billetera/                       # saldos y movimientos, depositar, deposito/retorno, retirar
├── src/app/admin/usuarios/                  # lista, detalle, roles, suspensión y auditoría
├── src/app/admin/retiros/
└── e2e/                                     # identidad, deposito, retiro + pasarela-falsa.ts
docker-compose.yml                           # + mailpit
```

**Structure Decision**:
- Un módulo de Nest por área (`auditoria`, `identidad`, `billetera`, `pagos`, `retiros`), como sugiere el brief.
- Las reglas críticas van en funciones puras con pruebas unitarias: políticas, sanitizador, armado de asientos,
  centavos y verificación de la confirmación.
- Todo lo que toca dinero pasa por `LibroContableService`, el único que inserta asientos. `BilleteraService` (el
  puerto), `DepositosService` y `RetirosService` lo usan, así que hay un solo lugar donde se bloquea, se comprueba la
  idempotencia y se valida el saldo.
- La auditoría del panel de administración vive en `apps/web/src/app/admin/usuarios/auditoria`, dentro de las
  carpetas del brief.

**Entrega en 3 PR** (brief §7):

1. **PR 1**: HU1 (registro y verificación), HU2 (sesión, bloqueo y recuperación), HU3 (guard, roles y auditoría),
   HU6 (2FA) y HU9 (usuarios, roles y auditoría). Incluye el proxy de la web y los cambios 3 a 6 de
   `cambios-contratos.md`. Desbloquea a los specs 3 y 4.
2. **PR 2**: HU4 (libro contable y `BilleteraPort`, más los cambios 1 y 2) y HU5 (depósitos con Payphone).
3. **PR 3**: HU7 (retiros) y HU8 (revisión de retiros).

## Complexity Tracking

| Desviación | Por qué hace falta | Alternativa más simple descartada porque |
|------------|--------------------|------------------------------------------|
| Proxy `/api/*` en la web con cabecera secreta | La web y la API están en sitios distintos: sin proxy, las cookies `SameSite=Lax` no viajan (research §1) | `SameSite=None` abre CSRF y choca con el bloqueo de cookies de terceros; un dominio común cuesta dinero |
| Disparadores de PostgreSQL (inmutabilidad, suma cero, columnas congeladas) | Defensa en profundidad del principio II: un error de código no puede editar el libro | Solo convención en el código, que no protege de un error ni de una consulta manual |
| Revocación de tokens en Redis | La suspensión y el cambio de contraseña deben cortar el acceso de inmediato (FR-027, FR-067) | Esperar 15 minutos a que caduque el token deja una ventana de abuso |
| Dos adaptadores de correo | Mailpit en local y CI, y una API HTTP en staging porque Render puede bloquear el SMTP | Un solo adaptador SMTP podría no funcionar en staging |
| Cambios fuera de las carpetas del brief (`app.module.ts` con el throttler, script de reportes, `docker-compose.yml`) | Rate limiting por cliente real, credenciales fuera de reportes y correo local | Sin ellos fallan FR-011, FR-064 y la verificación de correo en desarrollo; van con Erick como revisor |
