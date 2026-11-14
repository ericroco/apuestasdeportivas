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
- Mientras el guard no esté en `develop`, los specs 3 y 4 ya pueden decorar sus controladores; las pruebas e2e
  sobrescriben el guard con uno de prueba que fija `request.user`.

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
  `apuesta:<id>:reembolso`, `cupon:<id>:<usuarioId>:bono`.
- Montos: `Prisma.Decimal`, positivos, con 2 decimales. Nunca `number`.

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
  `iss: "apuestas-api"`, `aud: "apuestas"`.
- Transporte: cookie `httpOnly`, `Secure`, `SameSite=Lax` llamada `acceso`; el refresh rotativo va en otra cookie
  con `Path` restringido a la ruta de refresh. Para llamadas servidor a servidor (Next.js → reportes) se acepta
  también `Authorization: Bearer`.
- Reportes exige el rol `ADMINISTRADOR`.

## 7. Datos para reportes

El Spec 4 lee con `reportes_lectura` las tablas de los specs 2 y 3. Para no romper los reportes:

- Nombres de tablas y columnas en `snake_case` con `@@map` / `@map` en Prisma; un cambio de nombre o de tipo de
  una tabla ya integrada se avisa en el PR.
- Cada tabla con dinero guarda montos en `Decimal(14, 2)` y la fecha del movimiento en `timestamptz` (UTC).
