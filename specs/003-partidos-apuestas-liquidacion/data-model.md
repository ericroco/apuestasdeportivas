# Data Model: Partidos, apuestas y liquidación

Esquema en `apps/api/prisma/schema/partidos.prisma`. Modelos en español y PascalCase; tablas y columnas en
`snake_case` con `@@map`/`@map` (contrato 7). Dinero en `Decimal(14, 2)`, cuotas en `Decimal(8, 2)`, fechas en
`timestamptz` (UTC). Identificadores `uuid`. Mientras el modelo `Usuario` del Spec 2 no esté en `develop`,
`usuario_id` es `text` sin relación; se agrega la relación cuando entre.

## Enums

| Enum | Valores |
|------|---------|
| `EstadoPartido` | `PROGRAMADO`, `EN_VIVO`, `FINALIZADO`, `SUSPENDIDO`, `APLAZADO`, `CANCELADO` |
| `OrigenDato` | `OPERADOR`, `PROVEEDOR`, `SIMULACION` |
| `TipoMercado` | `RESULTADO_FINAL`, `DOBLE_OPORTUNIDAD`, `MAS_MENOS_GOLES`, `AMBOS_MARCAN` |
| `EstadoMercado` | `ABIERTO`, `SUSPENDIDO`, `CERRADO` |
| `CodigoSeleccion` | `LOCAL`, `EMPATE`, `VISITANTE`, `LOCAL_EMPATE`, `EMPATE_VISITANTE`, `LOCAL_VISITANTE`, `MAS`, `MENOS`, `SI`, `NO` |
| `ResultadoSeleccion` | `PENDIENTE`, `GANADORA`, `PERDEDORA`, `ANULADA` |
| `TipoApuesta` | `SIMPLE`, `COMBINADA` |
| `EstadoApuesta` | `PENDIENTE`, `GANADA`, `PERDIDA`, `ANULADA` |
| `TipoSaldo` | `REAL`, `BONO` (igual al del contrato 2) |
| `EstadoSolicitudVivo` | `EN_ESPERA`, `ACEPTADA`, `RECHAZADA` |
| `TipoLiquidacion` | `LIQUIDACION`, `ANULACION`, `RELIQUIDACION` |

## Entidades

### Competicion (`competicion`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| nombre | text | obligatorio, 2–120 caracteres |
| pais | text? | |
| idProveedor | int? | único; presente si se importó |
| creadaEn | timestamptz | |

### Partido (`partido`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| competicionId | uuid | FK → Competicion |
| nombreLocal, nombreVisitante | text | obligatorios y distintos entre sí |
| inicioEn | timestamptz | hora de inicio vigente |
| inicioOriginalEn | timestamptz | primera hora de inicio; base del plazo en un aplazamiento |
| estado | EstadoPartido | default `PROGRAMADO`; transiciones abajo |
| golesLocal, golesVisitante | int? | marcador del tiempo reglamentario; ≥ 0 |
| minuto | int? | solo en vivo |
| version | int | +1 en cada gol, cambio de estado o de cuota (revalidación en vivo) |
| versionResultado | int | +1 cada vez que el partido se finaliza o se corrige su resultado |
| suspendidoEn | timestamptz? | momento de la suspensión o el aplazamiento vigente |
| golesLocalSuspension, golesVisitanteSuspension | int? | marcador al suspender (FR-031) |
| origen | OrigenDato | |
| idProveedor | int? | único |
| creadoEn, actualizadoEn | timestamptz | |

Índices: `(estado, inicio_en)` para la cartelera; `(competicion_id)`.

**Transiciones permitidas** (`maquina-estados.ts`, función pura):

| Desde | Hacia |
|-------|-------|
| PROGRAMADO | EN_VIVO, APLAZADO, CANCELADO |
| EN_VIVO | FINALIZADO, SUSPENDIDO, CANCELADO |
| SUSPENDIDO | EN_VIVO, CANCELADO |
| APLAZADO | PROGRAMADO (con nueva `inicioEn`), CANCELADO |
| FINALIZADO | — (solo corrección de resultado) |
| CANCELADO | — |

Efectos: a EN_VIVO cierra los mercados sin `admiteVivo`; a SUSPENDIDO o APLAZADO suspende todos los mercados,
guarda `suspendidoEn` y el marcador, y programa el vencimiento; a FINALIZADO cierra los mercados y encola la
liquidación; a CANCELADO anula.

### Mercado (`mercado`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| partidoId | uuid | FK → Partido |
| tipo | TipoMercado | |
| linea | Decimal(4,1)? | obligatoria solo en `MAS_MENOS_GOLES`; termina en .5 |
| estado | EstadoMercado | default `ABIERTO` |
| admiteVivo | boolean | default `false` |
| gestionadoPorOperador | boolean | `true` al cambiar una cuota a mano; la importación ya no la sobrescribe |

Único: `(partido_id, tipo, linea)`.

### Seleccion (`seleccion`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| mercadoId | uuid | FK → Mercado |
| codigo | CodigoSeleccion | válido para el tipo de mercado |
| cuota | Decimal(8,2) | > 1.00 |
| resultado | ResultadoSeleccion | default `PENDIENTE` |

Único: `(mercado_id, codigo)`.

### HistorialCuota (`historial_cuota`, append-only)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| seleccionId | uuid | FK → Seleccion |
| cuotaAnterior | Decimal(8,2)? | null en la primera |
| cuotaNueva | Decimal(8,2) | |
| actorId | text? | null si viene del proveedor |
| origen | OrigenDato | |
| creadoEn | timestamptz | |

### Apuesta (`apuesta`, inmutable salvo estado y premio)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | text | |
| claveSolicitud | uuid | enviada por el cliente; único `(usuario_id, clave_solicitud)` (FR-020) |
| tipo | TipoApuesta | |
| monto | Decimal(14,2) | entre `APUESTA_MONTO_MIN` y `APUESTA_MONTO_MAX` |
| tipoSaldo | TipoSaldo | `BONO` solo si lo devuelve el cupón |
| cuotaTotal | Decimal(12,2) | producto de las cuotas congeladas, recalculada solo al anular selecciones (1.00) |
| gananciaPotencial | Decimal(14,2) | monto × cuotaTotal ≤ `APUESTA_GANANCIA_MAX` |
| estado | EstadoApuesta | default `PENDIENTE` |
| premioPagado | Decimal(14,2) | default 0; neto de pagos y reversiones |
| cuponId | text? | del contrato 4 |
| enVivo | boolean | |
| aceptadaEn | timestamptz | `now()` del servidor |
| liquidadaEn | timestamptz? | |

Índices: `(usuario_id, aceptada_en)` para "Mis apuestas" y el límite diario. Disparador: sin `DELETE`; `UPDATE`
solo de `estado`, `cuota_total`, `ganancia_potencial`, `premio_pagado` y `liquidada_en`.

### SeleccionApostada (`seleccion_apostada`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| apuestaId | uuid | FK → Apuesta |
| seleccionId | uuid | FK → Seleccion |
| partidoId | uuid | copia para la regla "un partido por combinada": único `(apuesta_id, partido_id)` |
| cuotaCongelada | Decimal(8,2) | inmutable |
| resultado | ResultadoSeleccion | default `PENDIENTE` |

Entre 1 (simple) y `APUESTA_MAX_SELECCIONES` (combinada, mínimo 2) por apuesta.

### SolicitudApuestaVivo (`solicitud_apuesta_vivo`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| usuarioId | text | |
| claveSolicitud | uuid | único `(usuario_id, clave_solicitud)` |
| datos | jsonb | selecciones, cuotas vistas, monto y cupón tal como se pidieron |
| versionPartido | int | `partido.version` al pedir |
| estado | EstadoSolicitudVivo | |
| motivoRechazo | text? | código legible (`CUOTA_CAMBIADA`, `MERCADO_SUSPENDIDO`, `MARCADOR_CAMBIO`…) |
| apuestaId | uuid? | FK → Apuesta si se aceptó |
| ejecutarEn | timestamptz | `creadaEn + APUESTA_RETARDO_VIVO_MS` |
| creadaEn | timestamptz | |

### Liquidacion (`liquidacion`, append-only)

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | uuid | PK |
| apuestaId | uuid | FK → Apuesta |
| tipo | TipoLiquidacion | |
| estadoResultante | EstadoApuesta | |
| montoMovido | Decimal(14,2) | positivo: premio o reembolso; negativo: reversión |
| versionResultado | int | versión del partido que la originó |
| claveIdempotencia | text | único; la misma que se envía a la billetera |
| creadaEn | timestamptz | |

### ConsumoProveedor (`consumo_proveedor`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| fecha | date | PK (día UTC) |
| consultas | int | ≥ 0 |
| limite | int | presupuesto vigente ese día |
| actualizadoEn | timestamptz | |

## Reglas de liquidación de una apuesta

- **Simple**: el estado sigue a su selección (GANADORA → GANADA, PERDEDORA → PERDIDA, ANULADA → ANULADA con
  reembolso).
- **Combinada**: PERDIDA si alguna selección es PERDEDORA; si no, PENDIENTE mientras alguna esté PENDIENTE; si no,
  ANULADA si todas son ANULADAS (reembolso completo); si no, GANADA con cuotaTotal = producto de las cuotas
  congeladas de las GANADORAS (ANULADA = 1.00).
- **Re-liquidación**: el nuevo estado se compara con el anterior y se mueve solo la diferencia (pago o reversión),
  con las claves `:r<n>` de research.md §7.
