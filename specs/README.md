# Catálogo de specs

Specs del equipo (Spec Kit), en orden de construcción. Cada spec se crea con `/speckit-specify` en su rama
`feature/spec-X` y su carpeta vive en `specs/NNN-nombre/`. Reparto, dependencias y calendario en
[`docs/equipo/reparto.md`](../docs/equipo/reparto.md); contratos entre specs en
[`docs/equipo/contratos.md`](../docs/equipo/contratos.md).

Fuente: fases de [`PLAN.md`](../PLAN.md). Reglas: [constitución](../.specify/memory/constitution.md).

## Specs del equipo

| # | Spec | Responsable | Rama | Fases | Alcance | Estado |
|---|------|-------------|------|-------|---------|--------|
| 1 | [`001-fundaciones-stack`](001-fundaciones-stack/spec.md) | Erick Rodas (líder) | `feature/spec-1` | F0 | Monorepo con las tres apps, BD y Redis locales, salud, CI/CD, SonarQube, despliegue, contratos entre specs | En revisión |
| 2 | [`002-identidad-billetera-pagos`](002-identidad-billetera-pagos/spec.md) | Ricardo | `feature/spec-2` | F1, F2, F6 | Registro, login, 2FA, roles, auditoría, ledger, billetera, depósitos Payphone y retiros | En revisión |
| 3 | `003-partidos-apuestas-liquidacion` | Daniel Campoverde | `feature/spec-3` | F3, F4, F5 | Partidos, mercados, worker de API-Football, apuestas simples y combinadas, liquidación en tiempo real, suspensiones | Pendiente |
| 4 | `004-promociones-fraude-reportes` | Erick Rodas (líder) | `feature/spec-4` | F6, F7 | Cupones, rollover, detección de fraude, reportes en Python, dashboard y cierre | Pendiente |

Al crear o cerrar una spec, actualiza su fila (Pendiente → En curso → En revisión → Terminada).

## Catálogo original (referencia)

Las 13 specs planificadas en el repositorio base y en qué spec del equipo quedaron:

| # original | Spec original | Fase | Spec del equipo |
|------------|---------------|------|-----------------|
| 001 | `001-fundaciones-monorepo` | F0 | 1 |
| 002 | `002-autenticacion-roles` | F1 | 2 |
| 003 | `003-billetera-ledger` | F2 | 2 |
| 004 | `004-depositos-payphone` | F2 | 2 |
| 005 | `005-partidos-mercados` | F3 | 3 |
| 006 | `006-sincronizacion-api-football` | F3 | 3 |
| 007 | `007-apuestas-simples-combinadas` | F4 | 3 |
| 008 | `008-liquidacion-tiempo-real` | F5 | 3 |
| 009 | `009-suspensiones-aplazamientos` | F5 | 3 |
| 010 | `010-promociones-cupones` | F6 | 4 |
| 011 | `011-retiros` | F6 | 2 |
| 012 | `012-deteccion-fraude` | F6 | 4 |
| 013 | `013-reportes-dashboard` | F7 | 4 |
