# Cambios a los contratos entre specs

Según `docs/equipo/contratos.md`, una firma no cambia sin acuerdo. El Spec 2 es dueño de los contratos 1, 2, 3 y 6,
así que estos cambios van en sus PR, con el integrante afectado como revisor.

## 1. `BilleteraPort.revertirPremio` (PR 2, revisor: Daniel)

Aceptado en las aclaraciones del 2026-11-15, tal como lo propuso el Spec 3:

```ts
export interface BilleteraPort {
  // …operaciones actuales…

  /**
   * Revierte un premio ya acreditado (corrección de resultado). Asiento compensatorio al mismo tipo de saldo;
   * a diferencia de `debitarApuesta`, NO lanza `SaldoInsuficienteError`: el saldo puede quedar negativo.
   */
  revertirPremio(tx: ClienteTransaccional, operacion: OperacionApuesta): Promise<ResultadoAsiento>;
}
```

- `contratos.md` §2: se agregan las claves `apuesta:<id>:premio:r<n>` y `apuesta:<id>:reversion:r<n>`.

## 2. `ConflictoIdempotenciaError` (PR 2, revisores: Daniel y Erick)

Nuevo error exportado desde `billetera.port.ts`: se lanza si una operación reutiliza una `claveIdempotencia` ya
registrada con **otros** datos (usuario, tipo o monto). Repetir con los mismos datos sigue devolviendo
`{ creado: false }`. Es aditivo: quien no lo capture verá un error 500, que es lo correcto ante un error de
programación.

## 3. Claims adicionales del token (PR 1, revisor: Erick)

Contrato 6: además de las claims definidas se agregan `sid` (id de la sesión) y `alc` (`completo` o
`activar-2fa`). Reportes debe rechazar tokens con `alc` distinto de `completo`. Las demás claims no cambian.

## 4. Transporte de la sesión en la web (PR 1, revisores: Daniel y Erick)

No cambia ninguna firma, pero sí cómo llaman a la API los demás specs desde el navegador:

- El navegador llama a **`/api/*` de la propia web** (proxy de Next.js, research §1), nunca a `API_URL` ni a
  `onrender.com`. El ticket del WebSocket del Spec 3 (`POST /api/tiempo-real/ticket`) también pasa por el proxy;
  solo la conexión de Socket.IO va directa a la API.
- Los componentes de servidor usan el helper `llamarApi()` de `apps/web/src/lib/api-servidor.ts`, que reenvía la
  cookie y la IP del cliente.
- Se documenta en `contratos.md` §1 y §6.

## 5. `ThrottlerGuard` por cliente (PR 1, revisor: Erick)

En `app.module.ts` el `ThrottlerGuard` del Spec 1 se reemplaza por `ThrottlerPorCliente`, que usa la IP real
resuelta por el proxy (research §1). Sin esto, todos los usuarios comparten el límite de la IP de Vercel.

## 6. `infra/postgres/usuario-solo-lectura.sql` (PR 1, revisor: Erick)

Al final del script se agrega un `REVOKE` de las tablas sensibles del Spec 2 (`credencial`, `segundo_factor`,
`codigo_recuperacion`, `sesion`, `enlace_correo`), protegido con `to_regclass`, para que volver a ejecutarlo no le
devuelva el permiso a `reportes_lectura` (research §14).

## 7. Aviso de tipos (sin cambio de firma)

`usuario.id` es `uuid`. Las columnas `usuario_id` del Spec 3 pueden declararse `@db.Uuid` con relación a `Usuario`.
