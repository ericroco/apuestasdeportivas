---
description: "Lista de tareas del Spec 3: partidos, apuestas y liquidación"
---

# Tasks: Partidos, apuestas y liquidación

**Input**: Design documents from `/specs/003-partidos-apuestas-liquidacion/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: la constitución (principio IV) exige pruebas primero en apuestas, liquidación y suspensiones, con
pruebas de concurrencia, idempotencia y abuso, y al menos una prueba de integración por historia. En cada fase las
pruebas van antes que la implementación y deben fallar primero.

**Organization**: tareas agrupadas por historia de usuario. Las fases siguen el orden de entrega de los 3 PR del
plan, no el orden estricto de prioridad: la HU5 (P2) entra en el PR 1 porque su modo simulación es el que mueve los
partidos en las pruebas de las HU3, HU6 y HU7.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US8 = HU1…HU8 de la spec)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias, configuración y tipos compartidos

- [x] T001 Instalar en la API `@nestjs/bullmq`, `bullmq`, `@nestjs/websockets`, `@nestjs/platform-socket.io` y `@nestjs/event-emitter`, y `socket.io-client` como dependencia de desarrollo (pruebas); en la web, `socket.io-client` (`apps/api/package.json`, `apps/web/package.json`)
- [x] T002 [P] Escribir primero las pruebas de las variables nuevas y sus reglas cruzadas en `apps/api/src/config/env.spec.ts` y luego agregarlas al esquema de `apps/api/src/config/env.ts` (contracts/configuracion.md)
- [x] T003 [P] Documentar las variables nuevas en `apps/api/.env.example`, `apps/web/.env.example` (`NEXT_PUBLIC_WS_URL`) y `specs/001-fundaciones-stack/contracts/configuracion.md`
- [x] T004 [P] Crear los enums, DTOs de respuesta y payloads de tiempo real en `packages/shared/src/partidos.ts` y exportarlos desde `packages/shared/src/index.ts`
- [x] T005 Crear `apps/api/src/colas/colas.module.ts` (`BullModule.forRootAsync` con `REDIS_URL` y `maxRetriesPerRequest: null`) y `apps/api/src/colas/nombres.ts`; registrar `ColasModule` y `EventEmitterModule` en `apps/api/src/app.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, migración, errores de negocio y dobles de los contratos del Spec 2

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase

- [x] T006 Escribir `apps/api/prisma/schema/partidos.prisma` según data-model.md (enums, 9 modelos, `@@map`/`@map`, índices y únicos)
- [x] T007 Generar la migración con `pnpm --filter api exec prisma migrate dev --name spec3_partidos_apuestas` y agregar a su `migration.sql` los disparadores de inmutabilidad de research.md §11 (`apps/api/prisma/migrations/<fecha>_spec3_partidos_apuestas/migration.sql`)
- [x] T008 [P] Crear `ErrorNegocio` (código, estado HTTP y datos) y su filtro con el formato de contracts/api-rest.md, con su prueba, en `apps/api/src/comun/error-negocio.ts`, `apps/api/src/comun/error-negocio.filter.ts` y `apps/api/src/comun/error-negocio.filter.spec.ts`; registrar el filtro en `apps/api/src/configurar-app.ts`
- [x] T009 [P] Crear las utilidades de dinero (parseo de texto decimal con 2 decimales, `ROUND_HALF_UP`, esquema zod `montoTexto` y `cuotaTexto`) con pruebas primero en `apps/api/src/comun/decimal.spec.ts` y `apps/api/src/comun/decimal.ts`
- [x] T010 [P] Crear el doble de billetera que participa en la transacción (esquema `pruebas`, `FOR UPDATE`, claves de idempotencia, `revertirPremio`) en `apps/api/test/dobles/billetera-sql.double.ts` y `apps/api/test/dobles/esquema-pruebas.sql` (research.md §12)
- [x] T011 [P] Crear `apps/api/test/dobles/auditoria-memoria.double.ts` y el guard de prueba que fija `request.user` desde la cabecera `x-usuario-prueba` en `apps/api/test/dobles/guard-prueba.ts`
- [x] T012 Crear `apps/api/test/utilidades/app-prueba.ts` (AppModule con los dobles sobrescritos y limpieza de las tablas del Spec 3 y del esquema `pruebas`) y `apps/api/test/utilidades/fabricas.ts` (competición, partido con mercados, usuario con saldo)
- [x] T013 Proveer `BILLETERA_PORT` y `AUDITORIA_PORT` de reemplazo mientras el Spec 2 no esté en `develop`: billetera que responde 503 "billetera no disponible" y auditoría que en desarrollo escribe en el log con un aviso y en producción falla cerrada (`apps/api/src/integracion/spec2-pendiente.module.ts`)

**Checkpoint**: la API arranca con el esquema nuevo y las pruebas pueden crear datos y usar los dobles

---

## Phase 3: User Story 1 - Cartelera y gestión de partidos por el operador (Priority: P1) 🎯 MVP — PR 1

**Goal**: el operador crea partidos, mercados y cuotas y los mueve entre estados; el apostador ve la cartelera y el detalle

**Independent Test**: crear un partido con un mercado como operador, verlo como apostador, cambiar una cuota y comprobar el historial y la auditoría

### Tests for User Story 1 ⚠️

- [x] T014 [P] [US1] Pruebas de la tabla completa de transiciones permitidas y prohibidas en `apps/api/src/partidos/maquina-estados.spec.ts`
- [x] T015 [P] [US1] Pruebas de validación de mercados (selecciones completas por tipo, línea terminada en .5 solo en `MAS_MENOS_GOLES`, cuota > 1.00) en `apps/api/src/partidos/mercados.spec.ts`
- [x] T016 [US1] Prueba e2e del operador y la cartelera: alta de partido y mercado, cambio de cuota con historial y auditoría, transición inválida (409 `TRANSICION_INVALIDA`), apostador sin rol (403), cartelera paginada y sin rutas `DELETE`, en `apps/api/test/partidos.e2e-spec.ts`

### Implementation for User Story 1

- [x] T017 [P] [US1] Implementar la máquina de estados (función pura) en `apps/api/src/partidos/maquina-estados.ts`
- [x] T018 [P] [US1] Implementar el catálogo de tipos de mercado y su validación en `apps/api/src/partidos/mercados.ts`
- [x] T019 [US1] Implementar `PartidosService` en `apps/api/src/partidos/partidos.service.ts`: alta y edición, `aplicarActualizacion()` (estado, marcador, `version`+1), mercados y cambio de cuota con `FOR UPDATE`, historial, auditoría y `gestionadoPorOperador`
- [x] T020 [US1] Crear los esquemas zod `.strict()` en `apps/api/src/partidos/partidos.esquemas.ts`, `cartelera.controller.ts`, `operador.controller.ts` (`@Roles('OPERADOR', 'ADMINISTRADOR')`) y `partidos.module.ts`; registrarlo en `apps/api/src/app.module.ts`
- [ ] T021 [P] [US1] Crear el cliente REST de la web con validación de respuestas y sus pruebas en `apps/web/src/lib/api-partidos.ts` y `apps/web/src/lib/api-partidos.test.ts`
- [ ] T022 [US1] Construir la cartelera y el detalle de partido con el skill `frontend-design`, mobile-first desde 360 px, en `apps/web/src/app/partidos/page.tsx` y `apps/web/src/app/partidos/[id]/page.tsx`
- [ ] T023 [US1] Construir el panel del operador (lista, alta de partido, mercados, cambio de cuota y estados) en `apps/web/src/app/operador/partidos/`

**Checkpoint**: HU1 funcional y probada de forma independiente

---

## Phase 4: User Story 5 - Importación automática y modo simulación (Priority: P2) — PR 1

**Goal**: un único worker importa partidos, resultados y cuotas sin superar el presupuesto; el modo simulación reemplaza al proveedor

**Independent Test**: con presupuesto bajo, varios ciclos nunca lo superan; en simulación, un partido completo cambia de estado por el mismo camino que uno real

### Tests for User Story 5 ⚠️

- [x] T024 [P] [US5] Pruebas del mapeo de API-Football (estados, marcador reglamentario, mercados por nombre) con respuestas grabadas en `apps/api/src/sincronizacion/api-football.mapeo.spec.ts` y `apps/api/src/sincronizacion/__fixtures__/`
- [x] T025 [P] [US5] Pruebas de la frecuencia adaptativa (en vivo frente a futuros, reserva del 10 %, mínimo 15 s) en `apps/api/src/sincronizacion/frecuencia.spec.ts`
- [x] T026 [US5] Prueba e2e del presupuesto con un proveedor HTTP falso: con presupuesto 5, ningún número de ciclos supera 5 consultas, se avisa "agotado" y reimportar no duplica partidos, en `apps/api/test/sincronizacion-presupuesto.e2e-spec.ts`
- [x] T027 [US5] Prueba e2e de simulación: `INICIO`, `GOL` y `FINAL` cambian el partido por `aplicarActualizacion()`, y la ruta responde 404 con la simulación apagada, en `apps/api/test/simulacion.e2e-spec.ts`
- [x] T028 [US5] Prueba e2e de tiempo real: ticket de un solo uso, conexión rechazada sin ticket o con uno usado, y `partido.actualizado` llega a la sala `partido:<id>`, en `apps/api/test/tiempo-real.e2e-spec.ts`

### Implementation for User Story 5

- [ ] T029 [US5] Con una clave gratuita de API-Football, verificar los puntos marcados "(verificar)" en research.md §2 y §10 (cuota del plan, cabeceras, paginación de cuotas, códigos de estado, `score.fulltime`, nombres de mercados), corregir research.md si algo difiere y guardar respuestas de ejemplo sin la clave en `apps/api/src/sincronizacion/__fixtures__/`
- [x] T030 [P] [US5] Definir `ActualizacionPartido` y el token `PROVEEDOR_DEPORTIVO` en `apps/api/src/sincronizacion/proveedor-deportivo.port.ts`
- [x] T031 [US5] Implementar el contador atómico con Lua y la copia en `consumo_proveedor` en `apps/api/src/sincronizacion/presupuesto.service.ts`
- [x] T032 [US5] Implementar el mapeo y el cliente HTTP (timeout, cabecera de la clave, nunca registrar la clave en el log) en `apps/api/src/sincronizacion/api-football.mapeo.ts` y `apps/api/src/sincronizacion/api-football.proveedor.ts`
- [x] T033 [P] [US5] Implementar `apps/api/src/sincronizacion/simulador.proveedor.ts` y `apps/api/src/sincronizacion/simulacion.controller.ts`
- [x] T034 [US5] Implementar `apps/api/src/sincronizacion/frecuencia.ts`, el procesador con trabajos repetibles, concurrencia 1 y espera exponencial en `sincronizacion.processor.ts`, y `sincronizacion.module.ts`
- [x] T035 [US5] Implementar el tiempo real base: `apps/api/src/tiempo-real/tickets.service.ts` (Redis `GETDEL`), `tiempo-real.gateway.ts` (CORS a `WEB_ORIGIN`, salas) y `notificador.service.ts`; emitir `partido.actualizado` tras el commit de `aplicarActualizacion()`
- [ ] T036 [P] [US5] Exponer `GET /operador/proveedor/consumo` y su vista en `apps/web/src/app/operador/consumo/page.tsx`
- [ ] T037 [US5] Construir la pantalla de simulación en `apps/web/src/app/operador/simulacion/page.tsx` y el marcador en vivo del detalle con `apps/web/src/lib/tiempo-real.ts`
- [ ] T038 [US5] Crear el script de datos de demostración `apps/api/scripts/seed-partidos.ts` y el comando `seed:partidos` en `apps/api/package.json`

**Checkpoint PR 1**: HU1 y HU5 completas; abrir PR 1 a `develop`

---

## Phase 5: User Story 2 - Apuesta simple con aceptación segura (Priority: P1) — PR 2

**Goal**: aceptar apuestas simples de forma atómica, con cuota congelada, reloj del servidor, límites e idempotencia de la solicitud

**Independent Test**: una apuesta con saldo descuenta exactamente el monto; sin saldo, tras el inicio o con otra cuota se rechaza sin efectos

### Tests for User Story 2 ⚠️

- [ ] T039 [P] [US2] Pruebas de cuota total, ganancia potencial y límites (mínimo, máximo, diario y ganancia máxima) en `apps/api/src/apuestas/calculo.spec.ts`
- [ ] T040 [US2] Prueba e2e de abuso: sin saldo (no queda apuesta ni asiento), después del inicio con otra hora del cliente, cuota distinta (409 con `cuotasVigentes`), fuera de límites, saldo negativo, rol operador (403), cupón sin Spec 4 (422) y campos extra en el cuerpo (400), en `apps/api/test/apuestas-abuso.e2e-spec.ts`
- [ ] T041 [US2] Prueba e2e de concurrencia: 20 apuestas simultáneas del mismo usuario nunca superan su saldo, y dos envíos con la misma `claveSolicitud` dejan una sola apuesta y un solo descuento, en `apps/api/test/apuestas-concurrencia.e2e-spec.ts`
- [ ] T042 [US2] Prueba e2e de inmutabilidad: no existen `PUT`, `PATCH` ni `DELETE` sobre apuestas y los disparadores rechazan un `UPDATE` de `monto` y un `DELETE` hechos por SQL, en `apps/api/test/apuestas-inmutables.e2e-spec.ts`

### Implementation for User Story 2

- [ ] T043 [P] [US2] Implementar `apps/api/src/apuestas/calculo.ts`
- [ ] T044 [US2] Implementar la aceptación atómica de research.md §4 (pasos 1 a 8), con `PROMOCIONES_APUESTA_PORT` inyectado con `@Optional()`, en `apps/api/src/apuestas/aceptacion.service.ts`
- [ ] T045 [US2] Crear `apps/api/src/apuestas/apuestas.esquemas.ts`, `apuestas.controller.ts` (`POST`, lista y detalle solo del dueño, `@Throttle`, rechazo de los roles operador y administrador) y `apuestas.module.ts`
- [ ] T046 [US2] Emitir `apuesta.aceptada` (contrato 5) después del commit y comprobarlo en `apps/api/test/apuestas-abuso.e2e-spec.ts`
- [ ] T047 [P] [US2] Construir el boleto (contexto de React, `sessionStorage`, ganancia potencial solo informativa, reconfirmación con las cuotas nuevas) con sus pruebas en `apps/web/src/components/boleto/`
- [ ] T048 [US2] Construir "Mis apuestas" (estados, selecciones, monto, cuota congelada, premio) en `apps/web/src/app/mis-apuestas/page.tsx`
- [ ] T049 [US2] Prueba de Playwright del criterio de cierre de F4 (imposible apostar sin saldo, después del inicio o con una cuota distinta) en `apps/web/e2e/apuestas.spec.ts`; depende del login del Spec 2

**Checkpoint**: HU2 funcional; las pruebas de abuso y concurrencia en verde

---

## Phase 6: User Story 4 - Apuesta combinada (Priority: P2) — PR 2

**Goal**: combinadas de 2 a N selecciones de partidos distintos con cuota total congelada

**Independent Test**: una combinada de 3 selecciones se acepta; dos del mismo partido se rechazan; un cambio de cuota pide reconfirmar

### Tests for User Story 4 ⚠️

- [ ] T050 [US4] Agregar casos de combinada (producto y redondeo, mínimo 2, máximo configurable, mismo partido) a `apps/api/src/apuestas/calculo.spec.ts`
- [ ] T051 [US4] Prueba e2e de combinadas: acepta 3 selecciones, rechaza mismo partido (`COMBINADA_INVALIDA`) y pide reconfirmar si cambió una cuota, en `apps/api/test/apuestas-combinadas.e2e-spec.ts`

### Implementation for User Story 4

- [ ] T052 [US4] Extender `apps/api/src/apuestas/calculo.ts` y `apps/api/src/apuestas/aceptacion.service.ts` para combinadas
- [ ] T053 [US4] Permitir varias selecciones en el boleto, con el aviso de "mismo partido", en `apps/web/src/components/boleto/`

---

## Phase 7: User Story 7 - Apuestas en vivo con retardo (Priority: P3) — PR 2

**Goal**: las apuestas en vivo esperan el retardo y se revalidan antes de aceptarse

**Independent Test**: una apuesta en vivo queda en espera sin descuento y se acepta tras el retardo; un gol o un cambio de cuota durante el retardo la rechaza

### Tests for User Story 7 ⚠️

- [ ] T054 [US7] Prueba e2e en vivo (retardo de 200 ms): queda `EN_ESPERA` sin descuento, se acepta al terminar el retardo, un gol, un cambio de cuota o una suspensión durante el retardo la rechazan sin descuento, y un mercado sin `admiteVivo` se cierra al iniciar el partido, en `apps/api/test/apuestas-vivo.e2e-spec.ts`

### Implementation for User Story 7

- [ ] T055 [US7] Implementar la solicitud en vivo y su procesador (research.md §6), `GET /apuestas/solicitudes-vivo/:id` y el evento `apuesta.vivo_resuelta`, en `apps/api/src/apuestas/vivo.processor.ts` y `apps/api/src/apuestas/aceptacion.service.ts`
- [ ] T056 [US7] Mostrar "en espera" y el resultado recibido por WebSocket en el boleto, en `apps/web/src/components/boleto/`

**Checkpoint PR 2**: HU2, HU4 y HU7 completas; abrir PR 2 a `develop`

---

## Phase 8: User Story 3 - Liquidación automática y resultado en tiempo real (Priority: P1) — PR 3

**Goal**: liquidar al finalizar el partido, de forma idempotente, y avisar al apostador en ≤ 5 s

**Independent Test**: al finalizar un partido simulado, las ganadoras cobran, las perdedoras no, el aviso llega sin recargar y reprocesar no cambia saldos

### Tests for User Story 3 ⚠️

- [ ] T057 [P] [US3] Pruebas de las reglas de los 4 tipos de mercado, líneas y mercados decididos antes del final en `apps/api/src/liquidacion/reglas-mercado.spec.ts`
- [ ] T058 [P] [US3] Pruebas del estado de la apuesta (simple, combinada, anuladas a 1.00 y todas anuladas) en `apps/api/src/liquidacion/estado-apuesta.spec.ts`
- [ ] T059 [US3] Prueba e2e de liquidación: las ganadoras reciben monto × cuota en su mismo tipo de saldo, las perdedoras no tienen movimiento, se emite `apuesta.liquidada` y el aviso por WebSocket llega en ≤ 5 s medido, en `apps/api/test/liquidacion.e2e-spec.ts`
- [ ] T060 [US3] Prueba e2e de idempotencia: 5 reprocesos del mismo resultado, trabajo duplicado y caída a mitad (error de la billetera en la tercera apuesta y reintento) dejan los saldos exactos, en `apps/api/test/liquidacion-idempotencia.e2e-spec.ts`

### Implementation for User Story 3

- [ ] T061 [P] [US3] Implementar `apps/api/src/liquidacion/reglas-mercado.ts`
- [ ] T062 [P] [US3] Implementar `apps/api/src/liquidacion/estado-apuesta.ts`
- [ ] T063 [US3] Implementar `apps/api/src/liquidacion/liquidacion.service.ts` (una transacción por apuesta, `FOR UPDATE`, fila en `liquidacion`, billetera y auditoría; evento y aviso después del commit)
- [ ] T064 [US3] Implementar `apps/api/src/liquidacion/liquidacion.processor.ts`, encolar con `jobId = liquidar:<partidoId>:v<versión>` desde `aplicarActualizacion()` al finalizar, y crear `POST /operador/partidos/:id/resultado` para finalizar
- [ ] T065 [US3] Actualizar "Mis apuestas" en vivo con `apuesta.liquidada` en `apps/web/src/app/mis-apuestas/`

---

## Phase 9: User Story 6 - Suspensiones, aplazamientos y cancelaciones (Priority: P2) — PR 3

**Goal**: mantener las apuestas dentro del plazo y anularlas y reembolsarlas una sola vez fuera de él

**Independent Test**: un partido aplazado fuera de plazo reembolsa una vez sus simples y recalcula sus combinadas con 1.00

### Tests for User Story 6 ⚠️

- [ ] T066 [US6] Prueba e2e de suspensiones con plazo de 0.001 h: reanudado en plazo se mantiene; vencido se anula y reembolsa una vez; cancelado se anula de inmediato; combinada con una anulada recalcula con 1.00; todas anuladas reembolsa completa; mercado ya decidido se liquida (FR-031); en `apps/api/test/suspensiones.e2e-spec.ts`

### Implementation for User Story 6

- [ ] T067 [US6] Programar el vencimiento con `jobId = vencer:<partidoId>:<n>` al suspender o aplazar, verificarlo al ejecutarse y anular por el camino de la liquidación con `apuesta:<id>:reembolso`, en `apps/api/src/sincronizacion/sincronizacion.processor.ts`, `apps/api/src/partidos/partidos.service.ts` y `apps/api/src/liquidacion/liquidacion.service.ts`
- [ ] T068 [US6] Agregar al panel del operador suspender, aplazar, reprogramar y cancelar con motivo, y mostrar el estado en la cartelera, en `apps/web/src/app/operador/partidos/` y `apps/web/src/app/partidos/`

---

## Phase 10: User Story 8 - Corrección de resultado y re-liquidación (Priority: P3) — PR 3

**Goal**: corregir resultados con re-liquidación controlada, reversión de premios y auditoría

**Independent Test**: tras una corrección, las nuevas ganadoras cobran una vez y las que dejan de ganar revierten aunque el saldo quede negativo

- [ ] T069 [US8] Acordar con el Spec 2 la operación `revertirPremio` y la convención `:r<n>` (contracts/cambios-contratos.md); sin acuerdo no se integra esta fase
- [ ] T070 [US8] Prueba e2e de re-liquidación: perdida → ganada paga una vez; ganada → perdida revierte aunque el saldo quede negativo; con saldo negativo se rechazan apuestas (`SALDO_NEGATIVO`); la misma corrección dos veces no tiene efecto; la auditoría guarda resultado anterior, nuevo y motivo; en `apps/api/test/reliquidacion.e2e-spec.ts`
- [ ] T071 [US8] Implementar la re-liquidación con las claves `:r<n>`, la corrección por `POST /operador/partidos/:id/resultado` sobre un partido finalizado y la corrección que llega del proveedor, en `apps/api/src/liquidacion/liquidacion.service.ts` y `apps/api/src/partidos/partidos.service.ts`
- [ ] T072 [US8] Agregar al panel del operador la corrección de resultado con motivo obligatorio y confirmación, en `apps/web/src/app/operador/partidos/`

**Checkpoint PR 3**: HU3, HU6 y HU8 completas; abrir PR 3 a `develop`

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T073 [P] Comprobar en Playwright el proyecto `movil-360` y la navegación por teclado de las pantallas nuevas en `apps/web/e2e/`
- [ ] T074 [P] Actualizar la convención de claves en `docs/equipo/contratos.md` §2 cuando el Spec 2 acepte la propuesta
- [ ] T075 [P] Actualizar el estado del Spec 3 en `specs/README.md` al abrir y cerrar cada PR
- [ ] T076 Correr `pnpm lint`, `pnpm typecheck`, `pnpm test` y la demostración de quickstart.md §2
- [ ] T077 Verificar cobertura ≥ 80 % en los módulos del Spec 3 (`apps/api/coverage/`) y el quality gate de SonarQube (`sonar-project.properties`)
- [ ] T078 Registrar en quickstart.md la latencia medida en T059 (SC-001) y la demora de detección observada con la API real

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → historias.
- **HU1** no depende de otras historias. **HU5** depende de HU1 (`aplicarActualizacion()`).
- **HU2** depende de HU1 (mercados y cuotas). **HU4** y **HU7** dependen de HU2 (aceptación); HU7 usa además el
  tiempo real base de HU5.
- **HU3** depende de HU2 (hay apuestas que liquidar) y de HU5 (simulación y tiempo real).
- **HU6** depende de HU3 (camino de anulación). **HU8** depende de HU3 y del acuerdo T069 con el Spec 2.
- **Polish** al final de cada PR (T075, T076) y del spec (resto).

### Dependencias externas

- Guard, billetera y auditoría del Spec 2: dobles hasta que entren en `develop` (T010, T011, T013).
- T049 (Playwright) necesita el login del Spec 2.
- T029 necesita una clave gratuita de API-Football.

### Within Each User Story

- Las pruebas se escriben primero y deben fallar.
- Funciones puras → servicios → controladores → UI.

## Parallel Example: User Story 1

```text
T014 Pruebas de maquina-estados.spec.ts
T015 Pruebas de mercados.spec.ts
T017 maquina-estados.ts   (después de T014)
T018 mercados.ts          (después de T015)
T021 api-partidos.ts de la web
```

## Parallel Example: User Story 3

```text
T057 reglas-mercado.spec.ts → T061 reglas-mercado.ts
T058 estado-apuesta.spec.ts → T062 estado-apuesta.ts
```

## Implementation Strategy

1. **PR 1** (Phases 1–4): base, HU1 y HU5. Se puede demostrar la cartelera, el panel del operador y la simulación.
2. **PR 2** (Phases 5–7): HU2, HU4 y HU7, con todas las pruebas de abuso y concurrencia en verde.
3. **PR 3** (Phases 8–10): HU3, HU6 y HU8. Criterios de cierre de F4 y F5.
4. Cada PR: `git pull --rebase origin develop`, `pnpm lint && pnpm typecheck && pnpm test`, revisión de otro
   integrante (reparto.md: Ricardo o Erick revisan a Daniel).

## Notes

- Commits atómicos con Conventional Commits en español: `test(apuestas): …`, `feat(liquidacion): …`.
- No tocar archivos de otro spec salvo en su PR, con el dueño como revisor.
- Si una migración de `develop` es posterior a la tuya, regenera la tuya (CONTRIBUTING.md §5).
