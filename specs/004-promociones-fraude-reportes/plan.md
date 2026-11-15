# Implementation Plan: Promociones, antifraude y reportes

**Branch**: `feature/spec-4` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-promociones-fraude-reportes/spec.md`

## Summary

Agregar a `apps/api` dos módulos de dominio: **promociones** (cupones, canjes, bonos y rollover, e implementación de
`PromocionesApuestaPort`) y **fraude** (actividad observada desde los eventos de dominio, reglas, alertas e
implementación de `RiesgoPort`), con su esquema en `promociones.prisma`. Ampliar `apps/reports` con validación del
JWT de administrador (clave pública), consultas parametrizadas de solo lectura, métricas con pandas y exportación
CSV/PDF. Agregar a `apps/web` las pantallas de gestión de cupones, alertas, reportes y "mis bonos", que hablan con la
API y con reportes desde el servidor de Next.js. Las dependencias de los specs 2 y 3 (auth, billetera, auditoría,
eventos y tablas) se consumen por los contratos de `apps/api/src/contracts/`, con dobles en las pruebas y falla
cerrada en ejecución mientras no estén integradas.

## Technical Context

**Language/Version**: TypeScript 6.0 sobre Node.js 22 LTS (`apps/api`, `apps/web`); Python 3.12 (`apps/reports`)
**Primary Dependencies**: NestJS 12 + Prisma 7 + zod 4 + `@nestjs/event-emitter` (nuevo, escucha de eventos de
dominio); FastAPI + psycopg 3 + pandas (nuevo) + PyJWT[crypto] (nuevo) + fpdf2 (nuevo, PDF); Next.js 16 (App Router,
Server Components y Server Actions) + Tailwind CSS 4
**Storage**: PostgreSQL 17: tablas nuevas `cupon`, `canje_cupon`, `bono`, `actividad_usuario`, `alerta_fraude`;
lectura (solo reportes) de las tablas de los specs 2 y 3
**Testing**: Vitest (unitarias del dominio con dobles de billetera y auditoría) y Vitest e2e contra PostgreSQL real
(concurrencia del cupo, idempotencia); pytest (unitarias de métricas con DataFrames y de JWT; integración con
PostgreSQL y el usuario `reportes_lectura`); Vitest + Testing Library (web); Playwright (flujos de pantallas con la
API simulada)
**Target Platform**: Render (API y reportes) y Vercel (web), igual que el Spec 1
**Project Type**: Monorepo web (frontend + API + servicio de reportes)
**Performance Goals**: aplicar un cupón añade < 50 ms a la transacción de la apuesta; resumen de 31 días con 100 000
apuestas < 3 s (SC-007), agregando en SQL y derivando en pandas
**Constraints**: sin servicios nuevos; reportes nunca escribe; el saldo solo lo mueve la billetera del Spec 2; los
contratos del Spec 1 no cambian de firma sin acuerdo (propuestas en `contracts/cambios-contratos.md`)
**Scale/Scope**: 8 historias, 37 requisitos; 5 tablas, ~12 endpoints de API, 4 de reportes, 6 pantallas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Seguridad y antifraude**: vectores de la spec mapeados a pruebas (tabla de `spec.md`). Toda ruta lleva
  `@Roles` y además un guard local de Spec 4 que deniega si no hay `request.user` (falla cerrada mientras el guard
  global del Spec 2 no exista). Acciones sensibles a auditoría por `AuditoriaPort`. Reportes valida firma
  asimétrica, emisor, audiencia, vigencia y rol; filtros parametrizados; CSV neutralizado. El token nunca llega al
  JavaScript del navegador.
- [x] **II. Integridad financiera**: este spec no guarda saldos. Bonos y conversiones van por `BilleteraPort` con
  claves `cupon:<cuponId>:<usuarioId>:<n>:bono` y `bono:<bonoId>:conversion`. El canje de cupón en una apuesta corre
  en el `tx` del Spec 3 con bloqueo de fila del cupón; si la apuesta se revierte, el canje y el bono también.
- [x] **III. Servidor como autoridad**: vigencia, cupo, límites y cuota final se calculan con datos y reloj del
  servidor. La web solo envía intenciones (crear cupón, resolver alerta) y muestra lo que devuelven API y reportes.
- [x] **IV. Pruebas primero**: cupones, bonos y rollover son dominio crítico: pruebas antes de la implementación,
  incluidas concurrencia (cupo con 50 canjes simultáneos), idempotencia (eventos repetidos) y abuso (reutilización,
  dispositivo, método de pago, cupón vencido, bono apilado, cuota baja).
- [x] **V. Tiempo real**: no publica resultados. Los listeners de eventos son idempotentes porque el emisor puede
  repetirlos; no retrasan la transacción del emisor (se emiten tras confirmarla).
- [x] **VI. Simplicidad**: solo módulos dentro de `apps/api`, `apps/reports` y `apps/web`. pandas entra en reportes
  como fija la constitución. Las reglas de fraude son consultas SQL sobre `actividad_usuario`, sin motor de reglas.
- [x] **VII. UX**: pantallas mobile-first desde 360 px con WCAG 2.1 AA y el skill `frontend-design`; textos que
  nombran la acción ("Crear cupón", "Confirmar fraude", "Descargar CSV").

**Re-evaluación post-diseño**: sin cambios; todas las compuertas siguen en verde.

## Project Structure

### Documentation (this feature)

```text
specs/004-promociones-fraude-reportes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-rest.md              # endpoints de cupones, bonos y alertas en apps/api
│   ├── reportes.md              # endpoints, JWT y consultas del servicio de reportes
│   ├── configuracion.md         # variables de entorno nuevas
│   └── cambios-contratos.md     # cambios propuestos a los contratos de los specs 2 y 3
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/
├── prisma/schema/promociones.prisma          # Cupon, CanjeCupon, Bono, ActividadUsuario, AlertaFraude
├── prisma/migrations/<fecha>_spec4_promociones_fraude/
├── src/comun/                                # guard de roles local y error de dependencia no disponible
├── src/promociones/
│   ├── promociones.module.ts                 # @Global: exporta PROMOCIONES_APUESTA_PORT
│   ├── cupones.controller.ts / cupones.service.ts / cupones.esquemas.ts
│   ├── canje.service.ts                      # bloqueo del cupón, límites, anti-abuso
│   ├── promociones-apuesta.adapter.ts        # implementa PromocionesApuestaPort
│   ├── bonos.service.ts / bonos.controller.ts / bonos.listener.ts   # depósito → bono; liquidación → rollover
│   └── *.spec.ts
├── src/fraude/
│   ├── fraude.module.ts                      # @Global: exporta RIESGO_PORT
│   ├── actividad.listener.ts                 # eventos → actividad_usuario (idempotente)
│   ├── reglas/                               # una función por regla
│   ├── alertas.service.ts / alertas.controller.ts
│   ├── riesgo.adapter.ts                     # implementa RiesgoPort (falla cerrada)
│   └── *.spec.ts
└── test/
    ├── dobles/                               # billetera y auditoría en memoria, guard de prueba
    └── promociones.e2e-spec.ts / fraude.e2e-spec.ts

apps/reports/src/reports/
├── seguridad.py          # validación del JWT (PyJWT) y dependencia de administrador
├── filtros.py            # modelo de filtros y validación del rango
├── consultas.py          # SQL parametrizado; único archivo que conoce nombres de tablas
├── metricas.py           # pandas: resumen, serie diaria, desglose
├── exportar.py           # CSV neutralizado y PDF (fpdf2)
└── rutas.py              # APIRouter /reportes/*
apps/reports/tests/       # test_seguridad, test_metricas, test_exportar, test_reportes_integracion

apps/web/src/
├── lib/servidor/         # cliente de API y reportes desde el servidor (reenvía la cookie de acceso)
├── app/operador/cupones/ # lista, nuevo y detalle (Server Actions)
├── app/admin/alertas/    # lista con filtros y resolución
├── app/admin/reportes/   # dashboard, filtros en la URL y rutas de exportación
└── app/bonos/            # mis bonos (apostador)
```

**Structure Decision**: un módulo de Nest por subdominio (promociones y fraude), cada uno `@Global()` para que los
specs 2 y 3 inyecten sus puertos con `@Optional()` sin importar el módulo. En reportes, `consultas.py` aísla el
esquema de los otros specs: si sus nombres finales difieren de la propuesta, se ajusta un solo archivo.

## Complexity Tracking

Sin violaciones que justificar.

- `@nestjs/event-emitter` lo nombra el contrato 5 como transporte dentro de la API; este spec lo instala y registra
  `EventEmitterModule.forRoot()` en `app.module.ts` (los specs 2 y 3 lo reutilizan).
- El guard local de roles duplica el control del guard global del Spec 2 a propósito: es la falla cerrada que exige
  el principio I mientras ese guard no esté en `develop`. Se mantiene después como defensa en profundidad.
