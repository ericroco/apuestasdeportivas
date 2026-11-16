# Implementation Plan: Partidos, apuestas y liquidación

**Branch**: `feature/spec-3` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-partidos-apuestas-liquidacion/spec.md`

## Summary

Construir en `apps/api` los módulos de partidos y mercados (máquina de estados, cuotas con historial, panel del
operador), la importación desde API-Football con un único worker BullMQ, presupuesto diario atómico en Redis y un
modo simulación, la aceptación atómica de apuestas simples, combinadas y en vivo contra `BilleteraPort` dentro de una
transacción de Prisma, y la liquidación idempotente por cola con notificación por Socket.IO. Suspensiones y
aplazamientos se resuelven con trabajos con retardo que vencen el plazo. En `apps/web`, cartelera, detalle con
boleto, "Mis apuestas" en vivo y panel del operador. Mientras los specs 2 y 4 no estén integrados, se trabaja contra
dobles de sus contratos; el de billetera participa en la transacción real para que las pruebas de atomicidad y
concurrencia valgan desde el primer PR.

## Technical Context

**Language/Version**: TypeScript 6.0 sobre Node.js 22 LTS (`apps/api`, `apps/web`, `packages/shared`)
**Primary Dependencies**: NestJS 12 (ESM) + Prisma 7 + zod (existentes); nuevas en la API: `@nestjs/bullmq` 12,
`bullmq` 6, `@nestjs/websockets` 12.5, `@nestjs/platform-socket.io` 12.5, `@nestjs/event-emitter` 12; nueva en la
web: `socket.io-client` 4.8
**Storage**: PostgreSQL 17 (tablas del Spec 3 en `partidos.prisma`, disparadores de inmutabilidad en la migración);
Redis 7 (colas BullMQ, contador de presupuesto, tickets de WebSocket)
**Testing**: Vitest (reglas puras: estados, mercados, cálculos, límites); Vitest + Supertest + `socket.io-client`
contra PostgreSQL y Redis reales (aceptación, concurrencia, idempotencia, suspensiones, presupuesto, tiempo real);
Vitest + Testing Library (boleto y "Mis apuestas"); Playwright (criterio de cierre de F4)
**Target Platform**: Render (una sola instancia de la API con el worker en el mismo proceso) y Vercel
**Project Type**: Monorepo web; este spec toca `apps/api`, `apps/web` y `packages/shared`
**Performance Goals**: resultado visible ≤ 5 s desde la detección (SC-001), incluido liquidar un partido con hasta
1 000 apuestas pendientes; aceptación de apuesta p95 < 500 ms sin cupón
**Constraints**: presupuesto de API-Football de 100 consultas/día en el plan gratuito; una instancia en Render
(plan gratuito, se duerme); sin Java ni Rust; contratos del Spec 2 aún no implementados
**Scale/Scope**: escala de demostración (decenas de partidos por día de las ligas configuradas, cientos de
usuarios); 8 historias de usuario, 42 requisitos, 3 PR

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Seguridad y antifraude**: la spec incluye la tabla de vectores de fraude y cada uno tiene prueba en el
  quickstart. Toda ruta pasa por el guard global (contrato 1) con `@Roles` en las del operador; operador y
  administrador no pueden apostar. Cambios de cuota, estados, correcciones, anulaciones y apuestas se auditan
  dentro de la misma transacción (contrato 3). `API_FOOTBALL_KEY` solo en el backend y validada al arrancar; la web
  nunca llama al proveedor. El WebSocket se autentica con un ticket de un solo uso.
- [x] **II. Integridad financiera**: el dinero se mueve solo con `BilleteraPort` dentro de la transacción del Spec 3
  (`debitarApuesta`, `acreditarPremio`, `reembolsarApuesta` y `revertirPremio`, este último propuesto en
  `contracts/cambios-contratos.md`). La billetera bloquea su fila con `FOR UPDATE`. Hay idempotencia en tres capas
  (estado de la apuesta, fila única en `liquidacion`, clave de la billetera), y los disparadores impiden borrar o
  alterar apuestas aceptadas.
- [x] **III. Servidor como autoridad**: la cuota se lee con `FOR SHARE` y se congela en la transacción; se rechaza
  si difiere de la vista (reconfirmación). La hora se toma de `now()` de PostgreSQL. El cuerpo de `POST /apuestas`
  es `.strict()` y no acepta ganancia, cuota total ni hora.
- [x] **IV. Pruebas primero**: las pruebas de abuso, concurrencia (20 apuestas simultáneas), idempotencia (5
  reprocesos), suspensiones, retardo en vivo y presupuesto se escriben antes que la implementación (quickstart §3);
  cada historia tiene al menos una prueba de integración.
- [x] **V. Tiempo real**: resultados y liquidaciones pasan por colas BullMQ persistentes con deduplicación por
  `jobId`; hay un único worker de sincronización con presupuesto diario que nunca se supera; las correcciones
  re-liquidan de forma controlada y auditada. La meta de ≤ 5 s se mide desde la detección: ver Complexity Tracking.
- [x] **VI. Simplicidad**: no hay servicio nuevo; el worker corre dentro de `apps/api`. BullMQ y Socket.IO ya están
  en `PLAN.md`. No se agregan `@nestjs/schedule` ni el adaptador Redis de Socket.IO (YAGNI).
- [x] **VII. UX**: cartelera, boleto, "Mis apuestas" y panel del operador con el skill `frontend-design`,
  mobile-first desde 360 px (proyecto `movil-360` de Playwright) y WCAG 2.1 AA; botones con nombres de acción
  ("Confirmar apuesta") y errores con su causa y su solución (`codigo` en `contracts/api-rest.md`).

**Re-evaluación post-diseño**: todas las compuertas siguen en verde. El diseño agregó una dependencia de contrato
(`revertirPremio`), que se acuerda con el Spec 2 antes del PR 3; la HU8 queda para ese PR.

## Project Structure

### Documentation (this feature)

```text
specs/003-partidos-apuestas-liquidacion/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-rest.md             # rutas, roles, cuerpos y códigos de error
│   ├── tiempo-real.md          # Socket.IO: ticket, salas y eventos
│   ├── configuracion.md        # variables de entorno nuevas
│   └── cambios-contratos.md    # propuesta de revertirPremio al Spec 2
├── checklists/requirements.md
└── tasks.md                    # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/schema/partidos.prisma          # modelos del data-model.md
├── prisma/migrations/<fecha>_spec3_*/     # tablas + disparadores de inmutabilidad
├── src/
│   ├── colas/                             # BullMQ: conexión y nombres de colas
│   ├── partidos/
│   │   ├── maquina-estados.ts             # transiciones (función pura)
│   │   ├── partidos.service.ts            # aplicarActualizacion(): único punto de entrada de cambios
│   │   ├── cartelera.controller.ts        # GET /partidos, /competiciones
│   │   └── operador.controller.ts         # /operador/* (partidos, mercados, cuotas, estados, resultado)
│   ├── sincronizacion/
│   │   ├── proveedor-deportivo.port.ts    # PROVEEDOR_DEPORTIVO
│   │   ├── api-football.proveedor.ts      # cliente HTTP + mapeo de estados y mercados
│   │   ├── simulador.proveedor.ts         # modo simulación
│   │   ├── presupuesto.service.ts         # contador Lua en Redis
│   │   ├── sincronizacion.processor.ts    # trabajos repetibles y vencimiento de plazos
│   │   └── simulacion.controller.ts       # /operador/simulacion/*
│   ├── apuestas/
│   │   ├── calculo.ts                     # cuota total, ganancia, límites (puro)
│   │   ├── aceptacion.service.ts          # transacción atómica (research §4)
│   │   ├── vivo.processor.ts              # retardo y revalidación (research §6)
│   │   └── apuestas.controller.ts         # /apuestas
│   ├── liquidacion/
│   │   ├── reglas-mercado.ts              # resolver selecciones por tipo (puro)
│   │   ├── estado-apuesta.ts              # simple/combinada/anulada (puro)
│   │   ├── liquidacion.service.ts         # liquidar, anular, re-liquidar
│   │   └── liquidacion.processor.ts       # cola liquidacion
│   └── tiempo-real/
│       ├── tickets.service.ts             # POST /tiempo-real/ticket
│       ├── tiempo-real.gateway.ts         # Socket.IO /tiempo-real
│       └── notificador.service.ts         # emite tras el commit
├── scripts/seed-partidos.ts
└── test/
    ├── dobles/                            # billetera SQL (esquema pruebas), auditoría, guard
    └── *.e2e-spec.ts                      # ver quickstart §3
apps/web/
├── src/app/partidos/                      # cartelera y [id]/ detalle
├── src/app/mis-apuestas/
├── src/app/operador/                      # partidos, mercados, simulación, consumo
├── src/components/boleto/                 # boleto de apuesta (contexto + sessionStorage)
├── src/lib/api-partidos.ts                # cliente REST con validación de respuestas
├── src/lib/tiempo-real.ts                 # ticket + socket.io-client
└── e2e/apuestas.spec.ts                   # criterio de cierre de F4
packages/shared/src/partidos.ts            # enums y payloads web ↔ api
```

**Structure Decision**: un módulo de Nest por área (`partidos`, `sincronizacion`, `apuestas`, `liquidacion`,
`tiempo-real`), con la lógica de negocio crítica en funciones puras (`maquina-estados`, `reglas-mercado`,
`estado-apuesta`, `calculo`) probadas unitariamente, y los servicios que tocan la base de datos probados contra
PostgreSQL real. Todo cambio de un partido entra por `PartidosService.aplicarActualizacion()`, venga del
proveedor, de la simulación o del operador: así hay un solo camino hacia la liquidación.

**Entrega en 3 PR** (brief §7):

1. **PR 1**: HU1 (partidos, mercados, cuotas, panel del operador) + HU5 (worker, presupuesto, simulación).
2. **PR 2**: HU2 (simple) + HU4 (combinada) + HU7 (en vivo), con la aceptación atómica y las pruebas de abuso y
   concurrencia.
3. **PR 3**: HU3 (liquidación y tiempo real) + HU6 (suspensiones) + HU8 (corrección, requiere `revertirPremio`).

## Complexity Tracking

| Desviación | Por qué hace falta | Alternativa más simple descartada porque |
|------------|--------------------|------------------------------------------|
| La meta de ≤ 5 s se mide desde que el sistema **detecta** el resultado, no desde que API-Football lo publica (principio V) | API-Football no avisa los cambios; con 100 consultas/día no se puede consultar cada 5 s (research §3) | Consultar cada 5 s agota el presupuesto en 8 minutos; un plan pago tampoco tiene webhooks. Se propone al líder una enmienda PATCH que aclare la medición |
| Disparadores de PostgreSQL de inmutabilidad en la migración | Defensa en profundidad del principio II (research §11) | Confiar solo en no exponer rutas no protege de un error de código ni de una consulta manual |
| Esquema `pruebas` con una billetera SQL de prueba fuera de las migraciones | Probar atomicidad y concurrencia reales antes de que exista la billetera del Spec 2 (research §12) | Un doble en memoria no participa en la transacción y no detectaría un descuento sin apuesta |
