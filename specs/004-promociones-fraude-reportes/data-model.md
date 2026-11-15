# Data Model: Promociones, antifraude y reportes

Esquema en `apps/api/prisma/schema/promociones.prisma`. Modelos en español y PascalCase; tablas, columnas y tipos
enumerados en `snake_case` con `@@map`/`@map` (contrato 7). Dinero en `Decimal(14, 2)`, porcentajes en
`Decimal(5, 2)`, cuotas en `Decimal(12, 2)`, fechas en `timestamptz` (UTC). El usuario se guarda como `text` hasta
que exista el modelo `Usuario` del Spec 2 (sin clave foránea). Las restricciones `CHECK` y los índices parciales se
agregan con SQL en la migración (Prisma no los declara).

## Enums

| Enum (tipo en BD) | Valores |
|-------------------|---------|
| `TipoCupon` (`tipo_cupon`) | `BONO_DEPOSITO`, `APUESTA_GRATIS`, `AUMENTO_CUOTA` |
| `EstadoCupon` (`estado_cupon`) | `ACTIVO`, `PAUSADO` |
| `OrigenCanje` (`origen_canje`) | `APUESTA`, `DEPOSITO` |
| `EstadoCanje` (`estado_canje`) | `ACEPTADO`, `RECHAZADO` |
| `EstadoBono` (`estado_bono`) | `ACTIVO`, `CUMPLIDO`, `VENCIDO` |
| `TipoActividad` (`tipo_actividad`) | `REGISTRO`, `DEPOSITO`, `APUESTA_ACEPTADA`, `APUESTA_LIQUIDADA`, `RETIRO` |
| `ReglaFraude` (`regla_fraude`) | `CUENTAS_DISPOSITIVO`, `CUENTAS_IP`, `METODO_PAGO_COMPARTIDO`, `CUPON_CUENTA_MULTIPLE`, `APUESTA_MONTO_ANOMALO`, `RAFAGA_APUESTAS`, `RETIRO_TRAS_DEPOSITO` |
| `SeveridadAlerta` (`severidad_alerta`) | `MEDIA`, `ALTA` |
| `EstadoAlerta` (`estado_alerta`) | `ABIERTA`, `CONFIRMADA`, `DESCARTADA` |

## Entidades

### Cupon (`cupon`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| codigo | varchar(20) | único; normalizado: sin espacios, en mayúsculas, `^[A-Z0-9]{4,20}$` |
| tipo | TipoCupon | inmutable si `canjes > 0` |
| porcentaje | Decimal(5,2)? | `BONO_DEPOSITO`: 1–200; `AUMENTO_CUOTA`: 1–100; nulo en `APUESTA_GRATIS` |
| montoFijo | Decimal(14,2)? | solo `APUESTA_GRATIS`, > 0 |
| topeBono | Decimal(14,2)? | solo `BONO_DEPOSITO`, > 0 |
| depositoMinimo | Decimal(14,2)? | solo `BONO_DEPOSITO`, ≥ 0 |
| apuestaMaxima | Decimal(14,2)? | solo `AUMENTO_CUOTA`, > 0 |
| iniciaEn | timestamptz | |
| terminaEn | timestamptz | > `iniciaEn`; solo puede extenderse |
| cupoTotal | int | > 0; solo puede ampliarse |
| limitePorUsuario | int | ≥ 1, default 1 |
| canjes | int | default 0; `CHECK (canjes <= cupo_total)` |
| estado | EstadoCupon | default `ACTIVO` |
| creadoPor | text | id del operador |
| creadoEn, actualizadoEn | timestamptz | |

`CHECK` por tipo: los campos que no corresponden al tipo son nulos y los obligatorios del tipo no lo son.

**Canjeable** si `estado = ACTIVO`, `iniciaEn ≤ now() < terminaEn` (reloj del servidor) y `canjes < cupoTotal`.

### CanjeCupon (`canje_cupon`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| cuponId | uuid? | FK → Cupon; nulo si el código no existía |
| codigo | varchar(40) | código tal como se recibió (normalizado) |
| usuarioId | text | |
| origen | OrigenCanje | |
| referenciaId | text? | `depositoId` en depósitos; nulo en apuestas (la apuesta guarda `cupon_id`) |
| estado | EstadoCanje | |
| motivo | text? | código de rechazo (tabla abajo); nulo si aceptado |
| numero | int? | n-ésimo canje aceptado del usuario en ese cupón (clave de idempotencia) |
| metodoPagoHuella | text? | solo depósitos |
| creadoEn | timestamptz | |

Únicos: `(origen, referencia_id)` (un depósito canjea una sola vez) y `(cupon_id, usuario_id, numero)`.
Índice: `(usuario_id, creado_en)`.

Los canjes **aceptados** en apuestas se escriben en el `tx` del Spec 3: si la apuesta se revierte, el canje
desaparece. Los **rechazados** en apuestas no se guardan (la transacción se revierte); los rechazados en depósitos sí.

Motivos de rechazo (`CuponInvalidoError.message` y `canje_cupon.motivo`):

| Código | Mensaje |
|--------|---------|
| `CUPON_INEXISTENTE` | El cupón no existe. |
| `CUPON_PAUSADO` | El cupón está pausado. |
| `CUPON_NO_VIGENTE` | El cupón todavía no está vigente. |
| `CUPON_VENCIDO` | El cupón venció. |
| `CUPON_AGOTADO` | El cupón se agotó. |
| `LIMITE_USUARIO` | Ya usaste este cupón. |
| `TIPO_NO_APLICA` | Este cupón no se puede usar en esta operación. |
| `MONTO_SUPERA_CUPON` | El monto supera el permitido por el cupón. |
| `DEPOSITO_INSUFICIENTE` | El depósito no alcanza el mínimo del cupón. |
| `BONO_ACTIVO` | Ya tienes un bono activo; termina su rollover antes de usar otro. |
| `SALDO_BONO_PENDIENTE` | Tienes saldo de una promoción anterior; úsalo en apuestas antes de recibir otro bono. |
| `CUENTA_MULTIPLE` | Este cupón ya se usó desde tu dispositivo o método de pago. |
| `USUARIO_EN_REVISION` | Tu cuenta está en revisión y no puede usar cupones de bono. |

### Bono (`bono`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | text | |
| cuponId | uuid | FK → Cupon |
| canjeId | uuid | FK → CanjeCupon, único |
| monto | Decimal(14,2) | > 0 |
| requisito | Decimal(14,2) | `monto × CUPON_ROLLOVER_MULTIPLICADOR` |
| avance | Decimal(14,2) | default 0; solo crece |
| estado | EstadoBono | default `ACTIVO` |
| otorgadoEn | timestamptz | |
| venceEn | timestamptz | `otorgadoEn + BONO_VIGENCIA_DIAS` |
| cumplidoEn | timestamptz? | |
| montoConvertido | Decimal(14,2)? | saldo de bono convertido al cumplir |

Índice único parcial: `(usuario_id) WHERE estado = 'ACTIVO'` (un bono activo por usuario).

Transiciones: `ACTIVO → CUMPLIDO` (avance ≥ requisito y sin apuestas pagadas con saldo de bono pendientes de
liquidar; convierte el saldo) y `ACTIVO → VENCIDO` (al consultarlo o al canjear con `now() ≥ venceEn` y
`avance < requisito`). Ambos estados son finales.

### ActividadUsuario (`actividad_usuario`, append-only)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | text | |
| tipo | TipoActividad | |
| referenciaId | text | `usuarioId`, `depositoId`, `apuestaId` o `retiroId` según el tipo |
| monto | Decimal(14,2)? | depósito, apuesta o retiro |
| cuota | Decimal(12,2)? | `APUESTA_ACEPTADA`; nula si el evento no la trae |
| tipoSaldo | text? | `APUESTA_ACEPTADA` (`REAL`/`BONO`) |
| resultado | text? | `APUESTA_LIQUIDADA` (`GANADA`/`PERDIDA`/`ANULADA`) |
| ip | text? | `REGISTRO` |
| dispositivo | text? | `REGISTRO` |
| metodoPagoHuella | text? | `DEPOSITO` |
| ocurridoEn | timestamptz | hora del servidor al recibir el evento |

Único: `(tipo, referencia_id)` → idempotencia de los listeners (`on conflict do nothing`). Índices:
`(usuario_id, tipo, ocurrido_en)`, `(dispositivo)`, `(ip, ocurrido_en)`, `(metodo_pago_huella)`.

### AlertaFraude (`alerta_fraude`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| regla | ReglaFraude | |
| severidad | SeveridadAlerta | |
| usuarioId | text | usuario evaluado |
| evidencia | jsonb | cuentas relacionadas, dispositivo, IP, montos, ventana |
| claveDeduplicacion | text | único (tabla abajo) |
| estado | EstadoAlerta | default `ABIERTA` |
| nota | text? | obligatoria al resolver, 5–500 caracteres |
| resueltaPor | text? | |
| resueltaEn | timestamptz? | |
| creadaEn | timestamptz | |

Índices: `(estado, creada_en)`, `(usuario_id, estado)`. Transiciones: `ABIERTA → CONFIRMADA | DESCARTADA` (finales).

| Regla | Severidad | Clave de deduplicación |
|-------|-----------|------------------------|
| `CUENTAS_DISPOSITIVO` | ALTA | `dispositivo:<usuarioId>:<dispositivo>` |
| `CUENTAS_IP` | MEDIA | `ip:<usuarioId>:<ip>` |
| `METODO_PAGO_COMPARTIDO` | ALTA | `metodo:<usuarioId>:<huella>` |
| `CUPON_CUENTA_MULTIPLE` | ALTA | `cupon:<usuarioId>:<cuponId>` |
| `APUESTA_MONTO_ANOMALO` | MEDIA | `monto:<apuestaId>` |
| `RAFAGA_APUESTAS` | MEDIA | `rafaga:<usuarioId>:<inicio de la ventana en epoch / ventana>` |
| `RETIRO_TRAS_DEPOSITO` | ALTA | `retiro:<usuarioId>:<depositoId>` |

## Reglas de rollover

1. `apuesta.aceptada` → `actividad_usuario` (`APUESTA_ACEPTADA`, monto, cuota, tipo de saldo).
2. `apuesta.liquidada` → insertar `APUESTA_LIQUIDADA`; si ya existía (re-liquidación o evento repetido), terminar.
3. Si el resultado es `GANADA` o `PERDIDA`, el usuario tiene un bono `ACTIVO` no vencido, existe la aceptación con
   `ocurridoEn ≥ otorgadoEn` y `cuota ≥ CUPON_ROLLOVER_CUOTA_MINIMA`: `avance += monto` (en una transacción con
   `SELECT … FOR UPDATE` sobre el bono).
4. Si `avance ≥ requisito` (se guarda el avance) y no hay apuestas pagadas con saldo de bono pendientes (una
   `APUESTA_ACEPTADA` con `tipo_saldo = 'BONO'` sin `APUESTA_LIQUIDADA` de la misma `referencia_id`): `saldo = obtenerSaldos(usuarioId, tx).bono`; si `saldo > 0`,
   `convertirBonoEnReal(tx, { monto: saldo, claveIdempotencia: 'bono:<id>:conversion', referencia: cuponId })`;
   bono a `CUMPLIDO` con `montoConvertido`; auditoría `bono.convertido`. Con pendientes el bono sigue `ACTIVO`
   (no vence) y el paso 4 se reintenta en cada `apuesta.liquidada` del usuario, sume o no avance.
5. Un canje que otorga bono se rechaza con `SALDO_BONO_PENDIENTE` si el usuario no tiene bono `ACTIVO` y
   `obtenerSaldos(usuarioId, tx).bono > 0` (con bono activo aplica `BONO_ACTIVO`).

## Datos que lee reportes (specs 2 y 3)

Ver [`contracts/reportes.md`](contracts/reportes.md) §3: tablas y columnas que el servicio de reportes espera de los
specs 2 y 3, y las de este spec.
