# Brief: Spec 2, identidad, billetera y pagos (Ricardo)

Documento pensado también como contexto para un agente de IA. Léelo junto con `CLAUDE.md`, la constitución
(`.specify/memory/constitution.md`), [contratos.md](contratos.md) y `CONTRIBUTING.md`. Si algo contradice el código
de `develop`, gana el código: avisa del desajuste en tu PR.

## 1. Alcance

Agrupa las specs 002, 003, 004 y 011 del catálogo original (fases F1 y F2 de `PLAN.md`, más los retiros de F6):

- **Identidad y acceso**: registro con verificación de correo y declaración de mayoría de edad; login con JWT de
  corta duración en cookie `httpOnly` y refresh rotativo; contraseñas con Argon2; 2FA TOTP (obligatorio para
  retirar); roles `APOSTADOR`, `OPERADOR`, `ADMINISTRADOR`; rate limiting, bloqueo por intentos fallidos y CAPTCHA
  en registro y login (Cloudflare Turnstile tiene claves de prueba); gestión de usuarios y roles por el
  administrador.
- **Auditoría** append-only de toda acción sensible (quién, qué, cuándo, IP, dispositivo).
- **Billetera y ledger** de doble entrada: cuentas usuario-real, usuario-bono, casa y pasarela; saldo derivado;
  bloqueo de fila; idempotencia.
- **Depósitos con Payphone sandbox**: intención de pago → pasarela → confirmación servidor a servidor → validación de
  monto, moneda y referencia → asiento en el ledger. El redirect del navegador nunca acredita.
- **Retiros**: con 2FA, solo al mismo titular/método del depósito, revisión manual sobre un umbral; si el sandbox no
  permite pagos salientes, retiro simulado aprobado por el administrador y registrado igual en el ledger.
- **UI** (Next.js, skill `frontend-design`): registro, login, 2FA, billetera (saldos y movimientos), depositar,
  retirar; panel de administración de usuarios y de retiros pendientes.

## 2. Arranque con Spec Kit

Rama `feature/spec-2`, carpeta `specs/002-identidad-billetera-pagos`. Pasos en `CONTRIBUTING.md` §2. Descripción
sugerida para `/speckit-specify`:

> Spec 2 del equipo: identidad, billetera y pagos. Registro con verificación de correo y mayoría de edad, login con
> JWT en cookie httpOnly y refresh rotativo, 2FA TOTP, roles apostador/operador/administrador con denegación por
> defecto, bloqueo por intentos fallidos, CAPTCHA y auditoría append-only. Billetera con ledger de doble entrada
> inmutable (saldo real y de bono separados) que implementa BilleteraPort de apps/api/src/contracts. Depósitos con
> Payphone sandbox confirmados servidor a servidor e idempotentes. Retiros con 2FA, solo al titular del depósito y
> revisión manual sobre un umbral. Pantallas de acceso, billetera, depósito, retiro y administración de usuarios y
> retiros.

## 3. Te pertenece

- `apps/api/src/identidad/`, `apps/api/src/auditoria/`, `apps/api/src/billetera/`, `apps/api/src/pagos/`,
  `apps/api/src/retiros/` (nombres sugeridos; decide en tu plan).
- `apps/api/prisma/schema/identidad.prisma` y sus migraciones.
- `apps/web/src/app/(cuenta)/`, `apps/web/src/app/billetera/`, `apps/web/src/app/admin/usuarios/`,
  `apps/web/src/app/admin/retiros/`.
- Registrar el guard global en `apps/api/src/app.module.ts` (única edición permitida fuera de tus carpetas).

## 4. Contratos

**Provees** (implementa las interfaces tal cual están en `apps/api/src/contracts/`):

- Guard global + `@Publico`, `@Roles`, `@UsuarioActual` (contrato 1).
- `BILLETERA_PORT` (contrato 2) y `AUDITORIA_PORT` (contrato 3).
- Eventos `usuario.registrado`, `deposito.confirmado`, `retiro.solicitado` (contrato 5).
- JWT con clave asimétrica y las claims del contrato 6 (reportes verificará con la clave pública).

**Consumes**: `RIESGO_PORT` con `@Optional()` (lo provee el Spec 4).

## 5. Vectores de fraude que tu spec debe mitigar (y probar)

| Vector | Prueba obligatoria |
|--------|-------------------|
| Doble gasto por concurrencia | N débitos simultáneos sobre la misma billetera dejan el saldo exacto y nunca negativo |
| Doble acreditación de un depósito | Confirmar dos veces el mismo pago (o recibir el callback repetido) acredita una sola vez |
| Depósito manipulado | Monto, moneda o referencia distintos a la intención registrada se rechazan |
| Acreditar por el redirect | Volver de Payphone sin confirmación servidor a servidor no cambia el saldo |
| Retiro sin 2FA o a otro titular | Se rechaza |
| Fuerza bruta | Tras N intentos fallidos la cuenta se bloquea temporalmente |
| Escalada de rol | Un apostador no puede llamar rutas de operador o administrador (prueba por endpoint) |
| Edición del ledger | No existe ruta ni método que actualice o borre asientos |

## 6. Variables de entorno nuevas

Agrégalas a `apps/api/src/config/env.ts`, a `apps/api/.env.example` y a
`specs/001-fundaciones-stack/contracts/configuracion.md`: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, `PAYPHONE_TOKEN`, `PAYPHONE_STORE_ID`, `PAYPHONE_BASE_URL`, `TURNSTILE_SECRET`,
`RETIRO_UMBRAL_REVISION`, y las de correo que elijas (para desarrollo, Mailpit en `docker-compose.yml`).

## 7. Plan de PRs

1. **PR 1 (lo antes posible)**: identidad, roles, guard global, auditoría y modelo `Usuario`. Desbloquea a Daniel.
2. **PR 2**: ledger, `BilleteraPort` y depósitos con Payphone.
3. **PR 3**: retiros y pantallas de administración.

Cada PR con su parte de `tasks.md` marcada, CI en verde y la revisión de otro integrante.
