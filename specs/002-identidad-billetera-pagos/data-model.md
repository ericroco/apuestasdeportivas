# Data Model: Identidad, billetera y pagos

Modelos en `apps/api/prisma/schema/identidad.prisma`. Nombres de modelo en español y PascalCase; tablas y columnas
en `snake_case` con `@@map` / `@map` (contrato 7). Identificadores `uuid` (`@db.Uuid`, `@default(uuid())`). Montos
`Decimal(14, 2)`. Fechas `timestamptz` (UTC). 🔒 = tabla sensible, sin acceso para `reportes_lectura` (research §14).

**Aviso al Spec 3**: `usuario.id` es `uuid`. Las columnas `usuario_id` del Spec 3 pueden pasar de `text` a
`@db.Uuid` con relación a `Usuario` cuando entre el PR 1.

## Enums

| Enum | Valores |
|------|---------|
| `Rol` | `APOSTADOR`, `OPERADOR`, `ADMINISTRADOR` (mismos que `ROLES` del contrato 1) |
| `EstadoUsuario` | `PENDIENTE_VERIFICACION`, `ACTIVO`, `SUSPENDIDO` |
| `PropositoEnlace` | `VERIFICACION_CORREO`, `RECUPERACION_CONTRASENA` |
| `TipoCuenta` | `USUARIO_REAL`, `USUARIO_BONO`, `CASA`, `PASARELA`, `RETIROS_TRANSITO` |
| `TipoAsiento` | `DEPOSITO`, `APUESTA`, `PREMIO`, `REEMBOLSO`, `BONO`, `CONVERSION_BONO`, `REVERSION_PREMIO`, `RETIRO_RESERVA`, `RETIRO_PAGO`, `RETIRO_DEVOLUCION` |
| `EstadoIntencionPago` | `PENDIENTE`, `CONFIRMADA`, `FALLIDA`, `CADUCADA`, `RECHAZADA_DISCREPANCIA` |
| `TipoMetodoPago` | `TARJETA`, `APP_PAYPHONE` |
| `EstadoRetiro` | `PENDIENTE_REVISION`, `PAGADO`, `RECHAZADO` |

## Identidad

### Usuario (`usuario`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| email | text | único; se guarda en minúsculas y sin espacios (FR-005, edge case) |
| nombreCompleto | text | 3 a 120 caracteres |
| fechaNacimiento | date | edad ≥ 18 con la fecha del servidor (FR-002) |
| roles | `Rol[]` | por defecto `{APOSTADOR}` (FR-007) |
| estado | EstadoUsuario | `PENDIENTE_VERIFICACION` al crear |
| correoVerificadoEn | timestamptz? | |
| intentosFallidos | int | por defecto 0; se reinicia con un inicio de sesión correcto (FR-010) |
| bloqueadoHasta | timestamptz? | |
| creadoEn / actualizadoEn | timestamptz | |

Transiciones: `PENDIENTE_VERIFICACION → ACTIVO` (verificación), `ACTIVO ⇄ SUSPENDIDO` (administrador). Un usuario
suspendido conserva su verificación.

### Credencial 🔒 (`credencial`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| usuarioId | uuid | PK, FK `usuario` |
| hashContrasena | text | Argon2id (research §4) |
| actualizadaEn | timestamptz | |

### SegundoFactor 🔒 (`segundo_factor`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| usuarioId | uuid | PK, FK |
| secretoCifrado | text | AES-256-GCM: `iv.tag.cifrado` en base64 (FR-022) |
| activadoEn | timestamptz? | `null` = activación pendiente |
| ultimoPasoUsado | bigint? | periodo TOTP del último código aceptado (FR-019) |

### CodigoRecuperacion 🔒 (`codigo_recuperacion`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | uuid | FK; índice |
| hashCodigo | text | SHA-256 |
| usadoEn | timestamptz? | un solo uso |

Al activar de nuevo el 2FA se borran los códigos anteriores (no son datos de dinero ni de auditoría).

### Sesion 🔒 (`sesion`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK; viaja como `sid` en el token de acceso |
| usuarioId | uuid | FK; índice |
| familiaId | uuid | todas las rotaciones de un mismo inicio de sesión |
| hashToken | text | único; SHA-256 de la credencial de renovación |
| usadaEn | timestamptz? | se fija al rotar |
| revocadaEn | timestamptz? | cierre, reutilización, suspensión o cambio de contraseña |
| expiraEn | timestamptz | creación + `JWT_REFRESH_TTL` |
| ip / dispositivo | text | |
| creadaEn | timestamptz | |

Se puede renovar si `usadaEn`, `revocadaEn` son nulos y `expiraEn` es futura (research §3).

### EnlaceCorreo 🔒 (`enlace_correo`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | uuid | FK |
| proposito | PropositoEnlace | |
| hashToken | text | único; SHA-256 |
| expiraEn | timestamptz | 24 h (verificación) o 1 h (recuperación) |
| usadoEn | timestamptz? | un solo uso |
| creadoEn | timestamptz | índice `(usuario_id, proposito, creado_en)` para el límite de 3 por hora (FR-004) |

## Auditoría

### EventoAuditoria (`evento_auditoria`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| actorId | uuid? | `null` = sistema; sin FK, para no bloquear nada |
| accion | text | `entidad.verbo_en_pasado` (contrato 3) |
| entidad | text | |
| entidadId | text? | |
| datos | jsonb? | sanitizado (FR-031) |
| ip | text? | |
| dispositivo | text? | |
| creadoEn | timestamptz | `default now()`; índices `(creado_en)`, `(actor_id, creado_en)`, `(accion, creado_en)` |

Disparadores: sin `UPDATE`, `DELETE` ni `TRUNCATE` (FR-030).

## Billetera y libro contable

### Billetera (`billetera`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| usuarioId | uuid | PK, FK; fila que se bloquea con `FOR UPDATE` (FR-039) |
| creadaEn | timestamptz | se crea en la misma transacción que el usuario, con sus dos cuentas |

### CuentaContable (`cuenta_contable`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| codigo | text | único: `casa`, `pasarela`, `retiros_transito`, `usuario:<id>:real`, `usuario:<id>:bono` |
| tipo | TipoCuenta | |
| usuarioId | uuid? | obligatorio en `USUARIO_*`, nulo en las del sistema (check) |

La migración inserta las tres cuentas del sistema.

### Asiento (`asiento`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| tipo | TipoAsiento | |
| claveIdempotencia | text | **única** (FR-037); formato `<entidad>:<id>:<operación>[:r<n>]` |
| usuarioId | uuid? | usuario afectado (para consultas y reportes) |
| origenTipo | text | `apuesta`, `deposito`, `retiro`, `cupon`… |
| origenId | text | |
| creadoEn | timestamptz | `default now()` |

### LineaAsiento (`linea_asiento`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| asientoId | uuid | FK |
| cuentaId | uuid | FK; índice `(cuenta_id, creado_en)` |
| monto | Decimal(14,2) | con signo, ≠ 0 (check) |
| creadoEn | timestamptz | igual al del asiento |

Disparadores: sin `UPDATE`, `DELETE` ni `TRUNCATE` en `asiento` y `linea_asiento` (FR-036). Restricción diferida:
`SUM(monto)` por asiento = 0 al confirmar (SC-008). Saldo de cuenta = `SUM(monto)` (FR-035).

**Asientos por operación** (`+` sube la cuenta):

| Operación | Clave | Líneas |
|-----------|-------|--------|
| Depósito | `deposito:<id>:acreditacion` | `PASARELA −m`, `USUARIO_REAL +m` |
| Débito de apuesta | `apuesta:<id>:debito` | `USUARIO_<tipo> −m`, `CASA +m` |
| Premio | `apuesta:<id>:premio[:r<n>]` | `CASA −m`, `USUARIO_<tipo> +m` |
| Reembolso | `apuesta:<id>:reembolso` | `CASA −m`, `USUARIO_<tipo> +m` |
| Reversión de premio | `apuesta:<id>:reversion:r<n>` | `USUARIO_<tipo> −m`, `CASA +m` (sin comprobar saldo) |
| Bono | `cupon:<id>:<usuarioId>:bono` | `CASA −m`, `USUARIO_BONO +m` |
| Conversión de bono | `rollover:<id>:conversion` | `USUARIO_BONO −m`, `USUARIO_REAL +m` |
| Reserva de retiro | `retiro:<id>:reserva` | `USUARIO_REAL −m`, `RETIROS_TRANSITO +m` |
| Pago de retiro | `retiro:<id>:pago` | `RETIROS_TRANSITO −m`, `PASARELA +m` |
| Devolución de retiro | `retiro:<id>:devolucion` | `RETIROS_TRANSITO −m`, `USUARIO_REAL +m` |

Las claves de apuestas, cupones y rollover las elige quien llama (specs 3 y 4); la tabla documenta la convención.

## Pagos

### IntencionPago (`intencion_pago`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK; es el `clientTransactionId` de Payphone |
| usuarioId | uuid | FK |
| monto | Decimal(14,2) | entre `DEPOSITO_MIN` y `DEPOSITO_MAX` (FR-045) |
| moneda | char(3) | `USD` |
| codigoCupon | text? | se pasa en el evento `deposito.confirmado` |
| estado | EstadoIntencionPago | |
| payphonePaymentId | text? | respuesta de Prepare |
| payphoneTransaccionId | bigint? | **único** (FR-048) |
| metodoPagoId | uuid? | FK, al confirmar |
| motivoFallo | text? | |
| creadaEn / expiraEn / resueltaEn | timestamptz | `expiraEn` = creación + 15 min (FR-050) |
| ip / dispositivo | text? | |

Disparador: impide cambiar `usuario_id`, `monto`, `moneda` y `codigo_cupon` (defensa en profundidad).
Transiciones: `PENDIENTE → CONFIRMADA | FALLIDA | CADUCADA | RECHAZADA_DISCREPANCIA`, y
`CADUCADA → CONFIRMADA` solo si Payphone aprueba y todo coincide (edge case).

### MetodoPago (`metodo_pago`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | uuid | FK |
| tipo | TipoMetodoPago | |
| marca / ultimosDigitos | text? | de `cardBrand` y `lastDigits` |
| titularNombre / titularDocumento / telefono | text? | de `optionalParameter4`, `document` y `phoneNumber` |
| huella | text | SHA-256; único `(usuario_id, huella)` |
| creadoEn | timestamptz | |

## Retiros

### Retiro (`retiro`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | uuid | FK |
| metodoPagoId | uuid | FK; del mismo usuario (FR-054) |
| monto | Decimal(14,2) | entre `RETIRO_MIN` y `RETIRO_MAX`, ≤ saldo real (FR-055) |
| claveSolicitud | uuid | único `(usuario_id, clave_solicitud)` |
| estado | EstadoRetiro | |
| motivosRevision | text[] | umbral y reglas del Spec 4 |
| referenciaPago | text? | `SIM-<uuid>` al pagar |
| resueltoPorId | uuid? | FK; distinto de `usuario_id` (FR-059) |
| comentario | text? | motivo de rechazo |
| creadoEn / resueltoEn | timestamptz | |

Transiciones: alta → `PAGADO` (automático) o `PENDIENTE_REVISION`; `PENDIENTE_REVISION → PAGADO | RECHAZADO`. Sin
regreso. Disparador: impide cambiar `usuario_id`, `monto` y `metodo_pago_id`.
