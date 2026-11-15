---
description: 'Lista de tareas del Spec 4: promociones, antifraude y reportes'
---

# Tasks: Promociones, antifraude y reportes

**Input**: Design documents from `/specs/004-promociones-fraude-reportes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: la constitución (principio IV) exige pruebas primero en cupones, con pruebas de concurrencia,
idempotencia y abuso, y al menos una prueba de integración por historia. En cada fase las pruebas van antes que la
implementación y deben fallar primero.

**Organization**: tareas agrupadas por historia de usuario, en el orden de los 3 PR del brief: cupones y rollover
(HU1–HU3), fraude y riesgo (HU4–HU5), reportes y dashboard (HU6–HU7). La HU8 (cierre) espera a los specs 2 y 3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US8 = HU1…HU8 de la spec)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias, configuración y tipos compartidos

- [ ] T001 Instalar `@nestjs/event-emitter` en la API (`apps/api/package.json`) y `pandas`, `PyJWT[crypto]` y `fpdf2` en reportes, con `pandas-stubs` en el grupo de desarrollo (`apps/reports/pyproject.toml`)
- [ ] T002 [P] Escribir primero las pruebas de las variables de cupones y fraude en `apps/api/src/config/env.spec.ts` y luego agregarlas al esquema de `apps/api/src/config/env.ts` (contracts/configuracion.md)
- [ ] T003 [P] Escribir primero las pruebas de `JWT_PUBLIC_KEY`, `JWT_ALGORITHM`, `JWT_ISSUER` y `JWT_AUDIENCE` en `apps/reports/tests/test_config.py` y luego agregarlas a `apps/reports/src/reports/config.py`
- [ ] T004 [P] Documentar las variables nuevas en `apps/api/.env.example`, `apps/reports/.env.example` y `specs/001-fundaciones-stack/contracts/configuracion.md`
- [ ] T005 [P] Crear los tipos de las respuestas de cupones, bonos y alertas en `packages/shared/src/promociones.ts` y exportarlos desde `packages/shared/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, migración, errores, autorización con falla cerrada y dobles de los contratos del Spec 2

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase

- [ ] T006 Escribir `apps/api/prisma/schema/promociones.prisma` según data-model.md (9 enums, 5 modelos, `@@map`/`@map`, únicos e índices)
- [ ] T007 Generar la migración con `pnpm --filter api exec prisma migrate dev --name spec4_promociones_fraude` y agregar a su `migration.sql` los `CHECK` por tipo de cupón, `canjes <= cupo_total` y el índice único parcial de bono activo
- [ ] T008 [P] Crear `ErrorNegocio` (código, estado HTTP y datos) y su filtro con el formato de contracts/api-rest.md, con su prueba, en `apps/api/src/comun/error-negocio.ts`, `apps/api/src/comun/error-negocio.filter.ts` y `apps/api/src/comun/error-negocio.filter.spec.ts`; registrar el filtro en `apps/api/src/configurar-app.ts` (mismo formato que planea el Spec 3: lo reutiliza)
- [ ] T009 [P] Escribir primero `apps/api/src/comun/roles.guard.spec.ts` (sin usuario → 401, sin rol → 403, con rol → pasa) y luego `apps/api/src/comun/roles.guard.ts`, que lee `ROLES_REQUERIDOS` del contrato 1
- [ ] T010 [P] Crear `DependenciaNoDisponibleError` (503 `DEPENDENCIA_NO_DISPONIBLE`) y el helper `requerir(puerto, nombre)` en `apps/api/src/comun/dependencias.ts`, con prueba
- [ ] T011 [P] Crear los dobles en memoria de `BilleteraPort` (saldos REAL/BONO por usuario, idempotencia por clave) y `AuditoriaPort`, y un guard de prueba que fija `request.user` desde una cabecera, en `apps/api/test/dobles/`
- [ ] T012 Crear `PromocionesModule` y `FraudeModule` vacíos `@Global()` y registrar `EventEmitterModule.forRoot()` y ambos módulos en `apps/api/src/app.module.ts`

**Checkpoint**: la API arranca, la migración aplica y las pruebas existentes siguen en verde

---

## Phase 3: User Story 1 - Gestión de cupones por el operador (Priority: P1) 🎯 MVP

**Goal**: el operador crea, lista, pausa, reactiva y amplía cupones, con auditoría

**Independent Test**: crear un cupón de aumento de cuota, verlo con 0 canjes, pausarlo y ver la vista previa "pausado"

### Tests for User Story 1 ⚠️

- [ ] T013 [P] [US1] Pruebas de los esquemas zod por tipo (campos obligatorios y prohibidos, rangos, código normalizado, vigencia) en `apps/api/src/promociones/cupones.esquemas.spec.ts`
- [ ] T014 [P] [US1] Pruebas de `CuponesService` (código duplicado sin distinguir mayúsculas, inmutabilidad con canjes, solo extender vigencia y ampliar cupo, pausar y reactivar, auditoría de cada cambio, 503 sin auditoría) en `apps/api/src/promociones/cupones.service.spec.ts`
- [ ] T015 [P] [US1] Prueba e2e de `/api/cupones` (crear, listar con filtros, detalle, PATCH, 403 para apostador, 401 sin sesión) en `apps/api/test/cupones.e2e-spec.ts`

### Implementation for User Story 1

- [ ] T016 [US1] Implementar `apps/api/src/promociones/cupones.esquemas.ts` y `apps/api/src/promociones/cupon.vista.ts` (vista con `vigente`)
- [ ] T017 [US1] Implementar `CuponesService` en `apps/api/src/promociones/cupones.service.ts`
- [ ] T018 [US1] Implementar `CuponesController` con `@Roles('OPERADOR', 'ADMINISTRADOR')` y `RolesGuard` en `apps/api/src/promociones/cupones.controller.ts`
- [ ] T019 [P] [US1] Crear el cliente de servidor (reenvía la cookie `acceso`, maneja 401/403/503) con pruebas en `apps/web/src/lib/servidor/api.ts` y `apps/web/src/lib/servidor/api.test.ts`
- [ ] T020 [US1] Crear las pantallas de cupones (lista con filtros y estado, formulario por tipo con Server Action, detalle con pausar/reactivar/extender) con el skill `frontend-design` en `apps/web/src/app/operador/cupones/`, con pruebas de componentes

**Checkpoint**: HU1 funcional y probada

---

## Phase 4: User Story 2 - Apuesta gratis y aumento de cuota (Priority: P1)

**Goal**: `PromocionesApuestaPort` valida y consume el cupón dentro de la transacción de la apuesta

**Independent Test**: aumento de 10 % sobre cuota 2.00 → 2.20; segundo uso → "ya usaste este cupón"

### Tests for User Story 2 ⚠️

- [ ] T021 [P] [US2] Pruebas de las reglas puras de canje (vigencia con reloj inyectado, cupo, límite por usuario, tipo, monto, cálculo de cuota final y redondeo) en `apps/api/src/promociones/reglas-canje.spec.ts`
- [ ] T022 [P] [US2] Pruebas de `CanjeService` (bloqueo del cupón, límite por usuario, bono activo, usuario con alerta alta, dispositivo compartido → rechazo y alerta fuera del `tx`, motivos legibles) en `apps/api/src/promociones/canje.service.spec.ts`
- [ ] T023 [P] [US2] Pruebas del adaptador (aumento de cuota, apuesta gratis acredita bono y devuelve `BONO`, crea bono con requisito, monto mayor al cupón, 503 sin billetera) en `apps/api/src/promociones/promociones-apuesta.adapter.spec.ts`
- [ ] T024 [US2] Prueba e2e con PostgreSQL: 50 canjes simultáneos con cupo 10 aceptan exactamente 10; una transacción revertida no deja canje ni bono; vista previa sin consumir en `apps/api/test/promociones.e2e-spec.ts`

### Implementation for User Story 2

- [ ] T025 [US2] Implementar las reglas puras en `apps/api/src/promociones/reglas-canje.ts` y los motivos en `apps/api/src/promociones/motivos.ts`
- [ ] T026 [US2] Implementar `CanjeService` (`SELECT … FOR UPDATE`, conteo y alta del canje en el `tx`) en `apps/api/src/promociones/canje.service.ts`
- [ ] T027 [US2] Implementar `PromocionesApuestaAdapter` y proveer `PROMOCIONES_APUESTA_PORT` desde `PromocionesModule` en `apps/api/src/promociones/promociones-apuesta.adapter.ts`
- [ ] T028 [US2] Implementar `GET /api/cupones/vista-previa/:codigo` con límite de 10 por minuto por usuario en `apps/api/src/promociones/vista-previa.controller.ts`

**Checkpoint**: el Spec 3 puede inyectar el puerto y aceptar apuestas con cupón

---

## Phase 5: User Story 3 - Bono de depósito y rollover (Priority: P1)

**Goal**: bono al confirmar un depósito, avance con apuestas que cuentan y conversión única al cumplir

**Independent Test**: depósito de 20.00 con 100 % tope 10.00 → bono 10.00, requisito 50.00; 50.00 apostados → conversión única

### Tests for User Story 3 ⚠️

- [ ] T029 [P] [US3] Pruebas de `BonosService.otorgarPorDeposito` (cálculo con tope, depósito mínimo → canje rechazado, código inexistente, idempotencia por depósito, bono activo, auditoría `bono.otorgado`) en `apps/api/src/promociones/bonos.service.spec.ts`
- [ ] T030 [P] [US3] Pruebas del rollover (solo ganadas/perdidas, aceptadas después del bono, cuota ≥ mínima, sin cuota no cuenta, re-liquidación no suma dos veces, conversión única de todo el saldo de bono, vencimiento perezoso) en `apps/api/src/promociones/rollover.service.spec.ts`
- [ ] T031 [US3] Prueba e2e: emitir `deposito.confirmado` 5 veces → un bono; liquidar apuestas hasta el requisito con eventos repetidos → una conversión; `GET /api/bonos/mios` en `apps/api/test/promociones.e2e-spec.ts`

### Implementation for User Story 3

- [ ] T032 [US3] Implementar `BonosService` en `apps/api/src/promociones/bonos.service.ts`
- [ ] T033 [US3] Implementar `RolloverService` en `apps/api/src/promociones/rollover.service.ts`
- [ ] T034 [US3] Implementar los listeners de `deposito.confirmado` y `apuesta.liquidada` (después de registrar la actividad) en `apps/api/src/promociones/bonos.listener.ts`
- [ ] T035 [US3] Implementar `GET /api/bonos/mios` en `apps/api/src/promociones/bonos.controller.ts`
- [ ] T036 [P] [US3] Crear la pantalla "Mis bonos" (avance con barra accesible, vencimiento, historial y canjes rechazados) en `apps/web/src/app/bonos/`, con pruebas

**Checkpoint**: PR 1 listo (HU1–HU3)

---

## Phase 6: User Story 4 - Detección de fraude y alertas (Priority: P1)

**Goal**: reglas sobre la actividad observada que crean alertas sin duplicar, y revisión por el administrador

**Independent Test**: dos registros con el mismo dispositivo → alerta alta con ambas cuentas; resolverla y verla auditada

### Tests for User Story 4 ⚠️

- [ ] T037 [P] [US4] Pruebas de `ActividadService` (cada evento a su tipo, idempotencia por `(tipo, referencia)`, cuota opcional) en `apps/api/src/fraude/actividad.service.spec.ts`
- [ ] T038 [P] [US4] Pruebas de las reglas de cuentas múltiples (dispositivo, IP con umbral y ventana, método de pago) en `apps/api/src/fraude/reglas/cuentas-multiples.spec.ts`
- [ ] T039 [P] [US4] Pruebas de las reglas de apuestas (monto anómalo con historial mínimo, ráfaga una vez por ventana) en `apps/api/src/fraude/reglas/apuestas.spec.ts`
- [ ] T040 [P] [US4] Pruebas de `AlertasService` (deduplicación, filtros y orden, resolución con nota, resolución única concurrente, auditoría) en `apps/api/src/fraude/alertas.service.spec.ts`
- [ ] T041 [US4] Prueba e2e: eventos de registro, depósito y apuesta generan sus alertas una sola vez; `/api/alertas` y `/api/alertas/:id/resolucion` con 403 para operador en `apps/api/test/fraude.e2e-spec.ts`

### Implementation for User Story 4

- [ ] T042 [US4] Implementar `ActividadService` y el listener de los cinco eventos en `apps/api/src/fraude/actividad.service.ts` y `apps/api/src/fraude/actividad.listener.ts`
- [ ] T043 [P] [US4] Implementar las reglas en `apps/api/src/fraude/reglas/cuentas-multiples.ts` y `apps/api/src/fraude/reglas/apuestas.ts`
- [ ] T044 [US4] Implementar `AlertasService` (alta deduplicada con `on conflict do nothing`) y `AlertasController` en `apps/api/src/fraude/alertas.service.ts` y `apps/api/src/fraude/alertas.controller.ts`
- [ ] T045 [US4] Crear las pantallas de alertas (lista con filtros en la URL, detalle con evidencia y formulario de resolución) en `apps/web/src/app/admin/alertas/`, con pruebas

---

## Phase 7: User Story 5 - Riesgo de retiros (Priority: P2)

**Goal**: `RiesgoPort` manda a revisión los retiros tras depósito sin actividad o de usuarios con alerta alta

**Independent Test**: depósito de 100.00, apuestas por 10.00, retiro → requiere revisión con su motivo

### Tests for User Story 5 ⚠️

- [ ] T046 [P] [US5] Pruebas de `RiesgoAdapter` (ventana, porcentaje mínimo, alerta alta abierta o confirmada, sin depósitos, falla cerrada ante error, alerta creada una vez) en `apps/api/src/fraude/riesgo.adapter.spec.ts`

### Implementation for User Story 5

- [ ] T047 [US5] Implementar la regla en `apps/api/src/fraude/reglas/retiro.ts` y `RiesgoAdapter`, y proveer `RIESGO_PORT` desde `FraudeModule`, en `apps/api/src/fraude/riesgo.adapter.ts`

**Checkpoint**: PR 2 listo (HU4–HU5)

---

## Phase 8: User Story 6 - Dashboard de reportes (Priority: P2)

**Goal**: métricas correctas, filtradas y solo para administradores, leídas en solo lectura

**Independent Test**: resumen de un rango con datos conocidos coincide al centavo; sin token 401, sin rol 403

### Tests for User Story 6 ⚠️

- [ ] T048 [P] [US6] Pruebas de seguridad (sin token, Bearer y cookie, firma de otra clave, vencido, `iss`/`aud` distintos, `alg: none` y HS256 rechazados, sin rol 403) en `apps/reports/tests/test_seguridad.py`
- [ ] T049 [P] [US6] Pruebas de filtros (rango obligatorio, orden, máximo 366 días, usuario por uuid o correo) en `apps/reports/tests/test_filtros.py`
- [ ] T050 [P] [US6] Pruebas de métricas con DataFrames (GGR, días sin datos en cero, totales, redondeo a centavos) en `apps/reports/tests/test_metricas.py`
- [ ] T051 [US6] Prueba de integración con PostgreSQL: crea en un esquema de prueba las tablas esperadas (contracts/reportes.md §3) con datos conocidos, consulta con `reportes_lectura` y compara cada métrica; 503 si falta una tabla; ninguna ruta escribe, en `apps/reports/tests/test_reportes_integracion.py`

### Implementation for User Story 6

- [ ] T052 [US6] Implementar la validación del JWT y la dependencia `requerir_administrador` en `apps/reports/src/reports/seguridad.py`
- [ ] T053 [P] [US6] Implementar `apps/reports/src/reports/filtros.py`
- [ ] T054 [US6] Implementar las consultas parametrizadas en `apps/reports/src/reports/consultas.py`
- [ ] T055 [US6] Implementar las métricas con pandas en `apps/reports/src/reports/metricas.py`
- [ ] T056 [US6] Implementar el router `/reportes` (resumen, serie diaria, competiciones) y registrarlo en `apps/reports/src/reports/rutas.py` y `apps/reports/src/reports/main.py`
- [ ] T057 [P] [US6] Crear la herramienta de desarrollo que genera un par Ed25519 y un token de administrador en `apps/reports/src/reports/herramientas/clave_dev.py`
- [ ] T058 [US6] Crear el cliente de reportes del servidor web (Bearer desde la cookie) con pruebas en `apps/web/src/lib/servidor/reportes.ts` y `apps/web/src/lib/servidor/reportes.test.ts`
- [ ] T059 [US6] Crear el dashboard (filtros en la URL, tarjetas de métricas, barras SVG con tabla equivalente, desglose por competición, estados vacío, sin permiso y no disponible) con el skill `frontend-design` en `apps/web/src/app/admin/reportes/`, con pruebas

---

## Phase 9: User Story 7 - Exportación CSV y PDF (Priority: P2)

**Goal**: descargar el reporte filtrado en CSV y PDF

**Independent Test**: los totales del CSV y del PDF coinciden con el resumen

### Tests for User Story 7 ⚠️

- [ ] T060 [P] [US7] Pruebas de CSV (BOM, secciones, neutralización de `=`, `+`, `-`, `@`, tabulador y retorno) y de PDF (cabecera `%PDF`, texto de filtros y totales) en `apps/reports/tests/test_exportar.py`

### Implementation for User Story 7

- [ ] T061 [US7] Implementar `apps/reports/src/reports/exportar.py` y `GET /reportes/exportar` en `apps/reports/src/reports/rutas.py`
- [ ] T062 [US7] Crear el route handler que transmite la descarga con los filtros de la URL en `apps/web/src/app/admin/reportes/exportar/route.ts` y los botones "Descargar CSV" y "Descargar PDF", con pruebas

**Checkpoint**: PR 3 listo (HU6–HU7)

---

## Phase 10: User Story 8 - Cierre del proyecto (Priority: P3)

**Goal**: versión 1.0 revisada, documentada y desplegada. ⏸️ Las tareas T065–T068 esperan a que los specs 2 y 3 estén en `develop`.

- [ ] T063 [P] [US8] Seed de demostración del Spec 4 (cupones de los tres tipos y alertas de ejemplo) en `apps/api/prisma/seed/promociones.ts`
- [ ] T064 [P] [US8] Prueba E2E de Playwright de las pantallas del Spec 4 con la API y reportes simulados (cupones, alertas, reportes, mis bonos a 360 px y escritorio) en `apps/web/e2e/spec4.spec.ts`
- [ ] T065 [US8] ⏸️ Revisión OWASP Top 10 y de dependencias de las tres apps con informe en `docs/seguridad/owasp-top10.md`
- [ ] T066 [US8] ⏸️ Revisión WCAG 2.1 AA y responsiva de todas las pantallas con informe en `docs/accesibilidad.md`
- [ ] T067 [US8] ⏸️ Seed integral de demostración y guion de demo en `apps/api/prisma/seed/` y `docs/demo.md`; documentación final (arquitectura, manual de usuario y de despliegue) en `docs/`
- [ ] T068 [US8] ⏸️ Crear `release/1.0`, PR a `main` con aprobación, tag `v1.0.0` y verificación del despliegue en producción

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T069 [P] Actualizar `docs/equipo/contratos.md` §4 con el comportamiento final de los puertos del Spec 4 y un enlace a `contracts/cambios-contratos.md`
- [ ] T070 Correr `pnpm lint && pnpm typecheck && pnpm test` y `pnpm format:check`; cobertura ≥ 80 % en `src/promociones`, `src/fraude` y `apps/reports/src/reports`
- [ ] T071 Marcar las tareas terminadas en este archivo y actualizar el estado del Spec 4 en `specs/README.md`

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → historias.
- HU1 → HU2 → HU3 (el canje y el bono de HU3 reutilizan `CanjeService` de HU2).
- HU4 puede empezar tras Phase 2, en paralelo con HU1–HU3; HU5 depende de HU4 (actividad y alertas).
- HU2 usa `AlertasService` de HU4 para la alerta de cuenta múltiple: si HU4 no está, la alerta se registra con un
  puerto mínimo que HU4 completa.
- HU6 y HU7 (reportes en Python y dashboard) no dependen de la API y pueden ir en paralelo desde Phase 1.
- HU8 espera a los specs 2 y 3 salvo T063 y T064.

## Parallel Example: User Story 6

```text
T048 test_seguridad.py → T052 seguridad.py
T049 test_filtros.py   → T053 filtros.py
T050 test_metricas.py  → T055 metricas.py
```

## Implementation Strategy

1. **PR 1** (Phases 1–5): base, HU1, HU2 y HU3. El Spec 3 puede integrar cupones.
2. **PR 2** (Phases 6–7): HU4 y HU5. El Spec 2 puede integrar el riesgo en retiros.
3. **PR 3** (Phases 8–9): HU6 y HU7, reportes y dashboard.
4. **Cierre** (Phase 10): cuando los cuatro specs estén en `develop`.
5. Cada PR: `git pull --rebase origin develop`, `pnpm lint && pnpm typecheck && pnpm test`, revisión de otro
   integrante (reparto.md: Ricardo o Daniel revisan a Erick).

## Notes

- Commits atómicos con Conventional Commits en español: `test(cupones): …`, `feat(fraude): …`, `feat(reportes): …`.
- No tocar archivos de otro spec salvo en su PR, con el dueño como revisor; los cambios de contrato se proponen en
  `contracts/cambios-contratos.md`.
- Si una migración de `develop` es posterior a la tuya, regenera la tuya (CONTRIBUTING.md §5).
