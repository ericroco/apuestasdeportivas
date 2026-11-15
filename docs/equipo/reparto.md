# Reparto del trabajo

Equipo de 3 integrantes y 4 specs (la actividad pide 4 o 5). Cada spec agrupa specs del catálogo original de
`specs/README.md` y se desarrolla con SDD (Spec Kit) en su propia rama `feature/spec-X`.

| Spec | Responsable | Rama | Carpeta | Agrupa (catálogo original) | Brief |
|------|-------------|------|---------|----------------------------|-------|
| 1. Fundaciones del stack | Erick Rodas (líder) | `feature/spec-1` | `specs/001-fundaciones-stack` | 001 | este PR |
| 2. Identidad, billetera y pagos | Ricardo | `feature/spec-2` | `specs/002-identidad-billetera-pagos` | 002, 003, 004, 011 | [spec-2-ricardo.md](spec-2-ricardo.md) |
| 3. Partidos, apuestas y liquidación | Daniel Campoverde | `feature/spec-3` | `specs/003-partidos-apuestas-liquidacion` | 005, 006, 007, 008, 009 | [spec-3-daniel.md](spec-3-daniel.md) |
| 4. Promociones, antifraude y reportes | Erick Rodas (líder) | `feature/spec-4` | `specs/004-promociones-fraude-reportes` | 010, 012, 013 | [spec-4-erick.md](spec-4-erick.md) |

El líder toma dos specs porque el Spec 1 es corto y el Spec 4 depende de los otros dos.

## Dependencias

```text
                 ┌──────────────────────────┐
                 │ Spec 1 · Fundaciones     │  (en develop: todos clonan desde aquí)
                 └────────────┬─────────────┘
               ┌──────────────┴──────────────┐
               ▼                             ▼
┌──────────────────────────┐   contratos  ┌──────────────────────────┐
│ Spec 2 · Identidad,      │ ───────────▶ │ Spec 3 · Partidos,       │
│ billetera y pagos        │  guard, ledger│ apuestas y liquidación   │
└────────────┬─────────────┘   auditoría  └────────────┬─────────────┘
             │        eventos y tablas (solo lectura)  │
             └──────────────────┬──────────────────────┘
                                ▼
                 ┌──────────────────────────┐
                 │ Spec 4 · Promociones,    │
                 │ antifraude y reportes    │
                 └──────────────────────────┘
```

Los specs 2 y 3 avanzan **en paralelo** gracias a los puertos de `apps/api/src/contracts/`
([contratos.md](contratos.md)). Para que Daniel no espere a Ricardo:

1. Ricardo abre primero un PR corto con autenticación, roles, auditoría y el modelo `Usuario` (su historia 1).
2. Daniel trabaja contra `BilleteraPort` con un doble en memoria hasta que entre la implementación real.
3. Erick empieza el Spec 4 por los cupones y las reglas de fraude con dobles, y conecta reportes cuando las tablas
   de los specs 2 y 3 estén en `develop`.

## Calendario sugerido

Alineado con el roadmap de [`PLAN.md`](../../PLAN.md):

| Semanas | Erick | Ricardo | Daniel |
|---------|-------|---------|--------|
| 16-nov a 29-nov | Spec 1 (PR) y revisiones | Spec 2: especificar y planear | Spec 3: especificar y planear |
| 30-nov a 27-dic | Spec 4: especificar, planear y cupones | Spec 2: auth (PR 1), ledger y depósitos | Spec 3: partidos, mercados y worker |
| 11-ene a 07-feb | Spec 4: reglas de fraude y reportes | Spec 2: retiros (PR 2) | Spec 3: apuestas y liquidación |
| 08-feb a 07-mar | Spec 4: dashboard (PR) | Revisión cruzada y correcciones | Spec 3: tiempo real y suspensiones (PR) |
| 08-mar a 21-mar | `release/1.0`, demo y defensa | Pruebas de abuso y demo | Pruebas E2E y demo |

## Reglas del equipo

- Cada integrante trabaja **solo** en su rama y en los archivos de su spec (ver "Te pertenece" en cada brief).
  Tocar archivos de otro spec se hace en su PR, con el dueño como revisor.
- Todo entra a `develop` por PR con CI en verde y **una aprobación de otro integrante**. Se revisan en cruz:
  Erick revisa a Ricardo y a Daniel; Ricardo revisa a Daniel y a Erick; Daniel revisa a Ricardo y a Erick.
- Commits atómicos con Conventional Commits en español: `feat(billetera): …`, `test(apuestas): …`.
- Antes de abrir un PR: `git pull --rebase origin develop` (o merge), `pnpm lint && pnpm typecheck && pnpm test`.
- Al empezar o cerrar un spec, actualizar su fila en `specs/README.md`.
