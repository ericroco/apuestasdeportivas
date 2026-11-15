# Cambios propuestos a contratos de otros specs

Según `docs/equipo/contratos.md`, una firma no cambia sin acuerdo: el cambio va en el PR del dueño con el otro
integrante como revisor. Estos son los que necesita el Spec 3.

## 1. `BilleteraPort.revertirPremio` (dueño: Spec 2, Ricardo)

**Motivo**: FR-038 (aclaración del 2026-11-14). Si una corrección de resultado convierte en perdida una apuesta ya
pagada, el premio se revierte con un asiento compensatorio aunque el saldo quede negativo.

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

- Clave de idempotencia: `apuesta:<id>:reversion:r<n>` (`n` = número de corrección del partido).
- El ledger debe admitir saldo negativo **solo** por esta operación; `obtenerSaldos` lo devuelve tal cual y el
  Spec 3 rechaza apuestas nuevas mientras sea negativo. El retiro queda bloqueado porque no hay saldo disponible.
- Mientras no esté integrado, el Spec 3 usa el doble de prueba con esta operación y deja la HU8 (corrección de
  resultados) para el último PR.

## 2. Convención de claves de idempotencia (contratos.md §2)

Se extiende con el sufijo de corrección para las re-liquidaciones: `apuesta:<id>:premio:r<n>` y
`apuesta:<id>:reversion:r<n>`. Las claves originales (`apuesta:<id>:debito|premio|reembolso`) no cambian.

## 3. Aviso: sesión del navegador entre sitios (Spec 2)

No es un cambio de firma. La web (`*.vercel.app`) y la API (`*.onrender.com`) son sitios distintos: una cookie
`SameSite=Lax` no se envía en `fetch` ni en el handshake de WebSocket del navegador a la API. El Spec 3 resuelve el
WebSocket con un ticket (ver `tiempo-real.md`), pero las llamadas REST del navegador dependen de cómo lo resuelva el
Spec 2 (proxy desde el servidor de Next.js o dominio común).
