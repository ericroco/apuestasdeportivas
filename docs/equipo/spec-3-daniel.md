# Brief: Spec 3, partidos, apuestas y liquidación (Daniel Campoverde)

Documento pensado también como contexto para un agente de IA. Léelo junto con `CLAUDE.md`, la constitución
(`.specify/memory/constitution.md`), [contratos.md](contratos.md) y `CONTRIBUTING.md`. Si algo contradice el código
de `develop`, gana el código: avisa del desajuste en tu PR.

## 1. Alcance

Agrupa las specs 005, 006, 007, 008 y 009 del catálogo original (fases F3, F4 y F5 de `PLAN.md`):

- **Partidos y mercados**: competición, partido, mercado, selección y cuota; máquina de estados
  `programado → en_vivo → finalizado`, más `suspendido`, `aplazado` y `cancelado`; CRUD del operador con cuotas
  manuales.
- **Sincronización con API-Football**: un único worker (BullMQ sobre Redis) con presupuesto diario de peticiones y
  frecuencia adaptativa (alta solo para partidos en vivo); la API key solo en el backend; **modo simulación** de
  partidos para la demo y para las pruebas.
- **Apuestas simples y combinadas**: boleto, aceptación atómica (validar saldo + descontar + registrar en una sola
  transacción vía `BilleteraPort`), cuota congelada y reconfirmación si cambió, cierre del mercado al inicio del
  partido con el reloj del servidor, retardo configurable en vivo, límites por apuesta, por usuario y de ganancia
  máxima.
- **Liquidación en tiempo real**: evento "partido finalizado" → job idempotente → asientos en el ledger →
  notificación por WebSocket (objetivo ≤ 5 s); re-liquidación controlada y auditada si cambia un resultado.
- **Suspensiones y aplazamientos**: plazo configurable (p. ej. 48 h); fuera de plazo o cancelado, anulación y
  reembolso; en combinadas, la selección anulada cuenta con cuota 1.00.
- **UI** (Next.js, skill `frontend-design`): cartelera, detalle de partido con mercados, boleto de apuesta, mis
  apuestas con resultado en vivo; panel del operador para partidos, mercados, cuotas y suspensiones.

## 2. Arranque con Spec Kit

Rama `feature/spec-3`, carpeta `specs/003-partidos-apuestas-liquidacion`. Pasos en `CONTRIBUTING.md` §2.
Descripción sugerida para `/speckit-specify`:

> Spec 3 del equipo: partidos, apuestas y liquidación. Partidos con máquina de estados (programado, en vivo,
> finalizado, suspendido, aplazado, cancelado), mercados y cuotas gestionados por el operador o importados de
> API-Football por un único worker con presupuesto diario y modo simulación. Apuestas simples y combinadas con
> aceptación atómica usando BilleteraPort, cuota congelada con reconfirmación, cierre al inicio del partido y
> límites. Liquidación automática e idempotente al finalizar el partido con notificación por WebSocket en 5 s o
> menos y re-liquidación auditada. Suspensiones y aplazamientos con plazo configurable, anulación, reembolso y cuota
> 1.00 en combinadas. Pantallas de cartelera, boleto, mis apuestas y panel del operador.

## 3. Te pertenece

- `apps/api/src/partidos/`, `apps/api/src/sincronizacion/`, `apps/api/src/apuestas/`, `apps/api/src/liquidacion/`,
  `apps/api/src/tiempo-real/` (nombres sugeridos; decide en tu plan).
- `apps/api/prisma/schema/partidos.prisma` y sus migraciones.
- `apps/web/src/app/partidos/`, `apps/web/src/app/mis-apuestas/`, `apps/web/src/app/operador/`.

## 4. Contratos

**Consumes**:

- Guard y decoradores (contrato 1): marca tus rutas con `@Roles('OPERADOR', 'ADMINISTRADOR')` o déjalas para
  usuarios autenticados. Hasta que el guard de Ricardo esté en `develop`, en tus pruebas e2e sobrescribe
  `APP_GUARD` con uno que fije `request.user`.
- `BILLETERA_PORT` (contrato 2): hasta que entre la implementación, usa un doble en memoria que cumpla la interfaz.
  `debitarApuesta`, `acreditarPremio` y `reembolsarApuesta` se llaman **siempre dentro de tu transacción** y con las
  claves de idempotencia `apuesta:<id>:debito|premio|reembolso`.
- `AUDITORIA_PORT` (contrato 3): anulaciones, correcciones de resultado y cambios de cuota.
- `PROMOCIONES_APUESTA_PORT` con `@Optional()` (contrato 4, lo provee el Spec 4).
- El modelo `Usuario` del Spec 2: mientras no esté, guarda `usuarioId` como texto y agrega la relación cuando entre.

**Provees**: eventos `apuesta.aceptada` y `apuesta.liquidada` (contrato 5), y tablas legibles para reportes
(contrato 7).

## 5. Vectores de fraude que tu spec debe mitigar (y probar)

| Vector | Prueba obligatoria |
|--------|-------------------|
| Apostar sin saldo | Se rechaza y no queda apuesta ni asiento |
| Apostar después del inicio | Se rechaza con el reloj del servidor, aunque el cliente envíe otra hora |
| Cuota alterada por el cliente | Se usa la cuota del servidor; si cambió, se pide reconfirmación |
| Doble pago de una apuesta ganada | Reprocesar el mismo resultado no cambia saldos (idempotencia) |
| Ventaja por latencia en vivo | La apuesta en vivo espera el retardo configurado antes de aceptarse |
| Modificar o borrar una apuesta aceptada | No existe ruta para hacerlo; solo anulación por regla de negocio con auditoría |
| Partido aplazado fuera de plazo | Reembolsa todas sus apuestas una sola vez |
| Agotar la cuota de API-Football | El worker no supera el presupuesto diario configurado |

Prueba E2E con Playwright (criterio de cierre de F4): imposible apostar sin saldo, tras el inicio o con una cuota
distinta a la mostrada.

## 6. Variables de entorno nuevas

En `apps/api/src/config/env.ts`, `apps/api/.env.example` y
`specs/001-fundaciones-stack/contracts/configuracion.md`: `API_FOOTBALL_KEY`, `API_FOOTBALL_BASE_URL`,
`API_FOOTBALL_PRESUPUESTO_DIARIO`, `API_FOOTBALL_SIMULACION`, `APUESTA_MONTO_MIN`, `APUESTA_MONTO_MAX`,
`APUESTA_GANANCIA_MAX`, `APUESTA_RETARDO_VIVO_MS`, `SUSPENSION_PLAZO_HORAS`. Para el WebSocket del navegador,
`NEXT_PUBLIC_WS_URL` en la web (no es secreto).

## 7. Plan de PRs

1. **PR 1**: partidos, mercados, cuotas, panel del operador y worker con modo simulación.
2. **PR 2**: apuestas simples y combinadas con aceptación atómica.
3. **PR 3**: liquidación en tiempo real, WebSocket y suspensiones/aplazamientos.
