# Contratos entre specs

Qué provee cada spec y qué consume de los demás. Las firmas en TypeScript ya están en
[`apps/api/src/contracts/`](../../apps/api/src/contracts) (solo interfaces, tokens y decoradores): el spec dueño
las **implementa** y los consumidores las **inyectan**, usando dobles de prueba mientras el dueño no las integre.

Regla: una firma de este documento no cambia sin acuerdo. El cambio va en el PR del dueño, con el otro
integrante como revisor.

| # | Contrato | Archivo | Provee | Consumen |
|---|----------|---------|--------|----------|
| 1 | Autenticación y roles | `autenticacion.ts` | Spec 2 | 2, 3, 4 |
| 2 | Billetera y ledger | `billetera.port.ts` | Spec 2 | 3, 4 |
| 3 | Auditoría | `auditoria.port.ts` | Spec 2 | 2, 3, 4 |
| 4 | Promociones y riesgo | `promociones.port.ts` | Spec 4 | 3 (cupones), 2 (riesgo en retiros) |
| 5 | Eventos de dominio | `eventos.ts` | Emisor indicado en cada evento | Quien escucha |
| 6 | Token de acceso (JWT) | este documento | Spec 2 | 4 (servicio de reportes en Python) |
| 7 | Datos para reportes | este documento | Specs 2 y 3 | 4 |

## 1. Autenticación y roles

- Roles: `APOSTADOR`, `OPERADOR`, `ADMINISTRADOR`.
- El Spec 2 registra un guard global (`APP_GUARD` en `app.module.ts`) que **deniega por defecto**: toda ruta exige
  usuario autenticado salvo las marcadas con `@Publico()`.
- `@Roles('OPERADOR', 'ADMINISTRADOR')` exige al menos uno de esos roles; sin `@Roles` basta estar autenticado.
- El guard deja en `request.user` un `UsuarioAutenticado` (`id`, `email`, `roles`); los controladores lo reciben
  con `@UsuarioActual()`.
- **Implementado (Spec 2, PR 1).** En las pruebas e2e no hace falta sobrescribir el guard: `crearAppDePrueba()`
  (`apps/api/test/ayudas/app-prueba.ts`) levanta la app real y `sesionDePrueba(app, { roles })`
  (`apps/api/test/ayudas/sesion-de-prueba.ts`) entrega una cookie con un token real de cualquier rol.
- Operador y administrador sin 2FA reciben un acceso con alcance `activar-2fa` y el guard les responde 403 en todo
  salvo activar el 2FA. Las pruebas usan `alcance: 'completo'` por defecto.
- El guard solo protege HTTP. Los gateways de WebSocket autentican con su propio ticket (Spec 3).
- `apps/api/test/cobertura-rutas.e2e-spec.ts` recorre todas las rutas de la app y falla si alguna responde sin
  sesión fuera de su lista blanca: una ruta pública nueva se agrega ahí, en el PR y con revisión.
- La IP y el dispositivo del cliente se leen con `@ClienteActual()` (`apps/api/src/identidad/http/cliente-http.ts`),
  que ya resuelve el proxy de la web. Úsalo en la auditoría en lugar de `request.ip`.
- Validación de entrada: hay un `StandardSchemaValidationPipe` global; basta con `@Body({ schema })`.

## 2. Billetera y ledger

- Ledger de doble entrada inmutable (constitución, principio II). El saldo se **deriva** de los asientos.
- Cada operación que mueve dinero recibe el `tx` (cliente transaccional de Prisma) **de quien llama** y una
  `claveIdempotencia` única. Así el Spec 3 hace en una sola transacción:

  ```ts
  await prisma.$transaction(async (tx) => {
    const apuesta = await tx.apuesta.create({ data: { /* … */ } });
    await billetera.debitarApuesta(tx, {
      usuarioId, apuestaId: apuesta.id, monto, tipoSaldo: 'REAL',
      claveIdempotencia: `apuesta:${apuesta.id}:debito`,
    });
  });
  ```

- La implementación bloquea la fila de la billetera con `SELECT … FOR UPDATE` dentro de `tx`
  (`tx.$queryRaw`) y lanza `SaldoInsuficienteError` si no alcanza.
- Convención de claves de idempotencia: `<entidad>:<id>:<operación>`, p. ej. `apuesta:<id>:premio`,
  `apuesta:<id>:reembolso`, `cupon:<id>:<usuarioId>:bono`. Las re-liquidaciones agregan el número de corrección:
  `apuesta:<id>:premio:r<n>` y `apuesta:<id>:reversion:r<n>`.
- Montos: `Prisma.Decimal`, positivos, con 2 decimales. Nunca `number`.
- **Implementado (Spec 2, PR 2).** `BILLETERA_PORT` es global. Además del contrato original:
  - `revertirPremio` (pedido por el Spec 3) es la única operación que puede dejar el saldo negativo.
  - `ConflictoIdempotenciaError`: la clave ya existe con otro usuario, tipo o monto.
  - `UsuarioNoHabilitadoError`: `acreditarBono` a un usuario sin correo verificado o suspendido. El Spec 4 no debe
    consumir el cupón en ese caso.
  - La billetera y las cuentas del usuario se crean solas en su primera operación.
  - Asientos y líneas son de solo inserción (disparadores) y cada asiento debe sumar cero al confirmar.

## 3. Auditoría

- `registrar(evento, tx?)` solo inserta. Con `tx`, el evento queda en la misma transacción que la acción.
- `accion` en formato `entidad.verbo_en_pasado`: `apuesta.aceptada`, `apuesta.anulada`,
  `partido.resultado_corregido`, `retiro.aprobado`, `cupon.creado`, `usuario.rol_cambiado`.
- `datos` nunca incluye contraseñas, tokens, secretos 2FA ni datos completos de pago.

## 4. Promociones y riesgo

- `PromocionesApuestaPort.aplicarAApuesta(tx, solicitud)`: el Spec 3 lo llama dentro de la transacción de la apuesta
  cuando el usuario envía un código de cupón. Devuelve `tipoSaldo` (`BONO` en apuestas gratis) y `cuotaFinal`
  (aumento de cuota). Si el cupón no aplica, lanza `CuponInvalidoError` con un motivo legible.
- `RiesgoPort.evaluarRetiro(usuarioId, monto)`: el Spec 2 lo llama al solicitar un retiro; `requiereRevision`
  envía el retiro a aprobación manual.
- Los consumidores inyectan ambos con `@Optional()`. Sin el Spec 4 integrado: el Spec 3 rechaza apuestas con cupón y
  el Spec 2 manda a revisión todo retiro sobre el umbral.
- Comportamiento implementado por el Spec 4 (`apps/api/src/promociones/`, `apps/api/src/fraude/`, ambos módulos
  `@Global()`):
  - El Spec 3 llama `aplicarAApuesta` **antes** de `debitarApuesta`: en una apuesta gratis el puerto acredita como bono
    el monto apostado y devuelve `tipoSaldo: 'BONO'`, y luego el Spec 3 debita ese bono.
  - El error de rechazo es `CuponRechazadoError` (subclase de `CuponInvalidoError`) con `message` legible y `codigo`
    estable (`CUPON_VENCIDO`, `LIMITE_USUARIO`, `BONO_ACTIVO`…). Si falta la billetera lanza
    `DependenciaNoDisponibleError` (503) antes de escribir.
  - `evaluarRetiro` devuelve los motivos `retiro_tras_deposito_sin_actividad` y `usuario_con_alerta_de_fraude`, y ante
    cualquier error interno `requiereRevision: true` con `evaluacion_no_disponible` (falla cerrada).
- El Spec 4 registra `EventEmitterModule.forRoot()` en `app.module.ts`, y `ErrorNegocio` con su filtro y la validación
  zod global en `configurar-app.ts`: los specs 2 y 3 los reutilizan.
- Cambios propuestos a los contratos de los specs 2 y 3 (método de pago en `deposito.confirmado`, `cuotaTotal` en
  `apuesta.aceptada`, tablas para reportes, anulación de saldo de bono): ver
  [`specs/004-promociones-fraude-reportes/contracts/cambios-contratos.md`](../../specs/004-promociones-fraude-reportes/contracts/cambios-contratos.md).

## 5. Eventos de dominio

Nombres y payloads en `eventos.ts` (`EVENTOS`, `MapaEventos`). Dentro de la API se publican con
`@nestjs/event-emitter`; el Spec 3 decide además qué viaja por Redis/BullMQ (resultados, liquidación).

| Evento | Emite | Escucha |
|--------|-------|---------|
| `usuario.registrado` | Spec 2 | Spec 4 (cuentas múltiples) |
| `deposito.confirmado` | Spec 2 | Spec 4 (bono de depósito) |
| `retiro.solicitado` | Spec 2 | Spec 4 (alertas) |
| `apuesta.aceptada` | Spec 3 | Spec 4 (apuestas anómalas) |
| `apuesta.liquidada` | Spec 3 | Spec 4 (rollover) |

Los eventos se emiten **después** de confirmar la transacción, y quien escucha es idempotente (puede recibir el
mismo evento dos veces).

Redis: el cliente inyectable `REDIS` (`apps/api/src/redis/`) es solo para comandos (caché, contadores, locks,
`publish`). Para suscribirse usa `redis.duplicate()`. BullMQ abre sus propias conexiones con `REDIS_URL` y
`maxRetriesPerRequest: null`; no reutiliza `REDIS`.

## 6. Token de acceso (JWT)

Para que el servicio de reportes (Python) valide el mismo token que la API sin poder emitirlo:

- Algoritmo asimétrico **EdDSA (Ed25519)** o **RS256**: la API firma con la clave privada (`JWT_PRIVATE_KEY`, solo
  en `apps/api`) y reportes verifica con la pública (`JWT_PUBLIC_KEY`).
- Claims: `sub` (id del usuario), `email`, `roles` (arreglo de `Rol`), `iat`, `exp` (15 min como máximo),
  `iss: "apuestas-api"`, `aud: "apuestas"`. Además `sid` (id de la sesión) y `alc` (`completo` o `activar-2fa`):
  **reportes debe rechazar los tokens con `alc` distinto de `completo`**. El algoritmo implementado es EdDSA.
- **El navegador nunca llama a la API directamente**: llama a `/api/*` de la propia web, un proxy de Next.js
  (`apps/web/src/app/api/[...ruta]/route.ts`) que reenvía cookies e IP. Así las cookies son del dominio de la web.
  En el código de la web, usa `api()` de `apps/web/src/lib/api-cliente.ts` (renueva la sesión sola). El ticket del
  WebSocket del Spec 3 también se pide por el proxy; solo la conexión de Socket.IO va directa a la API.
- Transporte: cookie `httpOnly`, `Secure`, `SameSite=Lax` llamada `acceso`; el refresh rotativo va en otra cookie
  con `Path` restringido a la ruta de refresh. Para llamadas servidor a servidor (Next.js → reportes) se acepta
  también `Authorization: Bearer`.
- Reportes exige el rol `ADMINISTRADOR`.

## 7. Datos para reportes

El Spec 4 lee con `reportes_lectura` las tablas de los specs 2 y 3. Para no romper los reportes:

- Nombres de tablas y columnas en `snake_case` con `@@map` / `@map` en Prisma; un cambio de nombre o de tipo de
  una tabla ya integrada se avisa en el PR.
- Cada tabla con dinero guarda montos en `Decimal(14, 2)` y la fecha del movimiento en `timestamptz` (UTC).
