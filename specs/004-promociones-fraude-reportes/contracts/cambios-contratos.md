# Cambios propuestos a contratos de otros specs

Según `docs/equipo/contratos.md`, una firma no cambia sin acuerdo: el cambio va en el PR del dueño con el otro
integrante como revisor. Estos son los que necesita el Spec 4. Ninguno rompe a quien ya consume el contrato: todos
son campos o columnas nuevas.

## 1. `DepositoConfirmado.metodoPagoHuella` (dueño: Spec 2, Ricardo)

**Motivo**: FR-006 y FR-018 (un cupón por método de pago; método de pago compartido entre cuentas).

```ts
export interface DepositoConfirmado {
  readonly usuarioId: string;
  readonly depositoId: string;
  readonly monto: string;
  readonly codigoCupon: string | null;
  /** SHA-256 en hex del identificador del medio de pago que confirma Payphone (nunca el dato en claro). */
  readonly metodoPagoHuella: string | null;
}
```

Mientras no llegue, el Spec 4 omite las dos reglas de método de pago (la de dispositivo sigue activa).

## 2. `ApuestaAceptada.cuotaTotal` (dueño: Spec 3, Daniel)

**Motivo**: FR-012 (cuota mínima para el rollover) sin leer la tabla `apuesta` desde la API.

```ts
export interface ApuestaAceptada {
  readonly usuarioId: string;
  readonly apuestaId: string;
  readonly monto: string;
  readonly tipoSaldo: 'REAL' | 'BONO';
  /** Cuota total congelada al aceptar, texto decimal con dos decimales. */
  readonly cuotaTotal: string;
}
```

Mientras no llegue, las apuestas no suman rollover (falla segura).

## 3. Datos para reportes (contrato 7)

### Spec 3 (Daniel)

- `competicion.deporte text not null default 'futbol'`: el filtro por deporte del requisito 3.8.

### Spec 2 (Ricardo)

Nombres en singular como los del Spec 3. Montos `Decimal(14,2)`, fechas `timestamptz`:

| Tabla | Columnas que lee reportes |
|-------|---------------------------|
| `usuario` | `id`, `email` |
| `deposito` | `id`, `usuario_id`, `monto`, `estado` (valor `CONFIRMADO` al acreditarse), `confirmado_en` |
| `retiro` | `id`, `usuario_id`, `monto`, `estado` (valor `PAGADO` al pagarse), `pagado_en` |

Si los nombres finales difieren, se ajusta `apps/reports/src/reports/consultas.py` en el PR que los integre.

## 4. Proveedores globales de los puertos del Spec 2

El Spec 4 inyecta `BILLETERA_PORT` y `AUDITORIA_PORT` con `@Optional()` sin importar el módulo del Spec 2. Se pide
que el Spec 2 los exporte desde un módulo `@Global()` (como hace el Spec 4 con `PROMOCIONES_APUESTA_PORT` y
`RIESGO_PORT`).

## 5. `BilleteraPort.anularSaldoBono` (dueño: Spec 2, Ricardo)

**Motivo**: la billetera tiene un solo saldo de bono por usuario y no ofrece cómo retirar el que queda de un bono
vencido. Ese saldo "sin dueño" podría convertirse en real por error al cumplir un bono posterior (revisión del
Spec 4, hallazgo 1). Mientras la operación no exista, el Spec 4 lo mitiga así: no otorga un bono nuevo mientras
quede saldo de bono sin bono activo (`SALDO_BONO_PENDIENTE`) y no convierte hasta que se liquiden las apuestas
pagadas con saldo de bono.

```ts
export interface OperacionAnulacionBono {
  readonly usuarioId: string;
  /** `bono:<bonoId>:anulacion`: reintentar la misma anulación no debita dos veces. */
  readonly claveIdempotencia: string;
  /** Bono vencido que origina la anulación (trazabilidad del asiento). */
  readonly referencia: string;
}

export interface BilleteraPort {
  /**
   * Debita todo el saldo de bono que le quede al usuario con un asiento compensatorio (el ledger es inmutable).
   * Devuelve el monto anulado (puede ser cero: entonces no crea asiento).
   */
  anularSaldoBono(
    tx: ClienteTransaccional,
    operacion: OperacionAnulacionBono,
  ): Promise<ResultadoAsiento & { readonly montoAnulado: Monto }>;
}
```

Cuando exista, el Spec 4 la llamará al marcar un bono como `VENCIDO` (misma transacción, clave
`bono:<bonoId>:anulacion`) y la regla `SALDO_BONO_PENDIENTE` dejará de bloquear en la práctica. Hasta entonces la
nueva operación no es obligatoria: el Spec 4 funciona sin ella.
