# Contrato REST del Spec 2

Prefijo `/api` (lo agrega `configurarApp`). Cuerpos JSON validados con zod `.strict()`; montos como **texto
decimal** con 2 decimales (`"50.00"`), nunca `number`. Errores con el formato de Nest
(`{ statusCode, message, error }`), con `message` legible en español. La web llega a todas estas rutas por su proxy
`/api/*` (research §1).

Leyenda de acceso: **P** = `@Publico()`, **A** = autenticado (cualquier rol), **2F** = permitido con
`alc: activar-2fa`, roles = `@Roles(...)`. "Apostador puro" = rol `APOSTADOR` sin `OPERADOR` ni `ADMINISTRADOR`
(FR-068). Todas las rutas **P** de identidad tienen un límite de frecuencia más estricto (5 por minuto e IP).

## Identidad (`/api/identidad`)

| Método y ruta | Acceso | Cuerpo | Respuesta |
|---------------|--------|--------|-----------|
| `POST /registro` | P | `{ nombreCompleto, email, contrasena, fechaNacimiento: "AAAA-MM-DD", declaraMayorEdad: true, captcha }` | `202 { mensaje }`, la misma exista o no el correo (FR-005) |
| `POST /correo/verificar` | P | `{ token }` | `200 { verificado: true }` / `400` caducado o usado |
| `POST /correo/reenviar` | A, 2F | — | `202`; `429` si ya hubo 3 en la última hora |
| `POST /sesion` | P | `{ email, contrasena, captcha }` | `200 { estado: "INICIADA" \| "REQUIERE_2FA" }` + cookies; `401` genérico; `423` bloqueada (sin decir si la contraseña era correcta) |
| `POST /sesion/2fa` | P (cookie `desafio`) | `{ codigo }` (TOTP o de recuperación) | `200 { estado: "INICIADA" }` + cookies |
| `POST /sesion/renovar` | P (cookie `renovacion`) | — | `204` + cookies nuevas; `401`; `409` renovación en curso |
| `POST /sesion/cerrar` | A, 2F | — | `204`, borra las cookies |
| `GET /yo` | A, 2F | — | `{ id, email, nombreCompleto, roles, verificado, tiene2fa, alcance }` |
| `POST /contrasena/olvido` | P | `{ email, captcha }` | `202` siempre |
| `POST /contrasena/restablecer` | P | `{ token, contrasena }` | `204`; cierra todas las sesiones |
| `POST /2fa/activacion` | A, 2F | — | `{ otpauthUrl, qrDataUrl }` (secreto pendiente) |
| `POST /2fa/activacion/confirmar` | A, 2F | `{ codigo }` | `{ codigosRecuperacion: string[10] }` (una sola vez) |
| `POST /2fa/desactivar` | A, solo apostador puro | `{ codigo }` | `204` |

**Cookies** (todas `httpOnly`, `SameSite=Lax`, `Secure` salvo `COOKIE_SECURE=false` en local):
`acceso` (`Path=/`, 15 min), `renovacion` (`Path=/api/identidad/sesion`, 7 días),
`desafio` (`Path=/api/identidad/sesion`, 5 min).

## Billetera (`/api/billetera`)

| Método y ruta | Acceso | Respuesta |
|---------------|--------|-----------|
| `GET /` | APOSTADOR | `{ real: "0.00", bono: "0.00", retirable: "0.00" }` (`retirable` = max(real, 0)) |
| `GET /movimientos?cursor&limite` | APOSTADOR | `{ items: [{ id, fecha, tipo, tipoSaldo, monto, saldoResultante, origenTipo, origenId }], siguiente }` |
| `GET /metodos-retiro` | APOSTADOR | `[{ id, tipo, descripcion: "Visa •••• 4242 · TITULAR" }]` |

`monto` lleva signo (`"-10.00"`) desde el punto de vista del usuario.

## Pagos (`/api/pagos`)

| Método y ruta | Acceso | Cuerpo | Respuesta |
|---------------|--------|--------|-----------|
| `POST /depositos` | apostador puro, verificado | `{ monto, codigoCupon? }` | `201 { intencionId, urlPago }` |
| `POST /depositos/confirmar` | P | `{ id: number, clientTransactionId: uuid }` | `200 { estado, monto, saldoReal? }`; idempotente |
| `GET /depositos/:id` | APOSTADOR (dueño) | — | `{ id, estado, monto, motivoFallo? }` |

`/depositos/confirmar` es pública porque la autoridad es la respuesta de Payphone, no el navegador: con datos
inventados, Confirm falla o no coincide y no se acredita nada (FR-047).

## Retiros (`/api/retiros`)

| Método y ruta | Acceso | Cuerpo | Respuesta |
|---------------|--------|--------|-----------|
| `POST /` | apostador puro, verificado, con 2FA | `{ monto, metodoPagoId, codigo2fa, claveSolicitud: uuid }` | `201 { id, estado: "PAGADO" \| "PENDIENTE_REVISION", referenciaPago? }` |
| `GET /` | APOSTADOR | — | lista de sus retiros |

## Administración (`/api/admin`)

| Método y ruta | Acceso | Cuerpo | Respuesta |
|---------------|--------|--------|-----------|
| `GET /usuarios?q&estado&rol&cursor` | ADMINISTRADOR | — | página de usuarios |
| `GET /usuarios/:id` | ADMINISTRADOR | — | detalle, saldos, depósitos y retiros recientes |
| `PUT /usuarios/:id/roles` | ADMINISTRADOR | `{ roles: Rol[], codigo2fa }` | `200`; `409` con saldo o si es el último administrador (FR-026) |
| `POST /usuarios/:id/suspension` | ADMINISTRADOR | `{ motivo }` | `204`; revoca sesiones (FR-027) |
| `DELETE /usuarios/:id/suspension` | ADMINISTRADOR | — | `204` (reactivar) |
| `GET /auditoria?usuarioId&accion&desde&hasta&cursor` | ADMINISTRADOR | — | página de eventos (FR-033) |
| `GET /retiros?estado=PENDIENTE_REVISION&cursor` | ADMINISTRADOR | — | retiros con usuario, motivos e historial |
| `POST /retiros/:id/aprobacion` | ADMINISTRADOR | `{ codigo2fa }` | `200 { estado: "PAGADO", referenciaPago }`; idempotente |
| `POST /retiros/:id/rechazo` | ADMINISTRADOR | `{ motivo, codigo2fa }` | `200 { estado: "RECHAZADO" }`; idempotente |

## Acciones de auditoría que registra este spec

`usuario.registrado`, `usuario.correo_verificado`, `sesion.iniciada`, `sesion.fallida`, `usuario.bloqueado`,
`sesion.cerrada`, `sesion.reutilizacion_detectada`, `usuario.contrasena_restablecida`, `segundo_factor.activado`,
`segundo_factor.desactivado`, `acceso.denegado`, `usuario.rol_cambiado`, `usuario.suspendido`,
`usuario.reactivado`, `deposito.iniciado`, `deposito.confirmado`, `deposito.fallido`, `deposito.discrepancia`,
`retiro.solicitado`, `retiro.aprobado`, `retiro.rechazado`.
