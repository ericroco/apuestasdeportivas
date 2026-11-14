# Brief: Spec 4, promociones, antifraude y reportes (Erick Rodas)

Documento pensado también como contexto para un agente de IA. Léelo junto con `CLAUDE.md`, la constitución
(`.specify/memory/constitution.md`), [contratos.md](contratos.md) y `CONTRIBUTING.md`. Si algo contradice el código
de `develop`, gana el código: avisa del desajuste en tu PR.

## 1. Alcance

Agrupa las specs 010, 012 y 013 del catálogo original (fases F6 y F7 de `PLAN.md`):

- **Promociones y cupones**: código, tipo (bono de depósito, apuesta gratis, aumento de cuota), vigencia, cupo
  total y límite por usuario; rollover antes de convertir saldo de bono en real; anti-abuso (un cupón por
  usuario, dispositivo y método de pago). Gestión de cupones por el operador.
- **Detección de fraude**: reglas de cuentas múltiples por dispositivo/IP/método de pago, apuestas anómalas y retiro
  inmediato tras depósito sin actividad; alertas para el administrador; `RiesgoPort` para los retiros.
- **Reportes** (servicio Python `apps/reports`): usuario de solo lectura, validación del JWT de administrador con la
  clave pública, métricas (volumen apostado, GGR, premios pagados, depósitos y retiros, usuarios activos, uso de
  cupones, alertas de fraude), filtros por fecha, deporte, competición y usuario, exportación CSV y PDF.
- **Dashboard** en Next.js que consume reportes desde el servidor.
- **Cierre del proyecto**: revisión OWASP, accesibilidad, seed de demostración, `release/1.0` y tag `v1.0.0`.

## 2. Arranque con Spec Kit

Rama `feature/spec-4`, carpeta `specs/004-promociones-fraude-reportes`. Pasos en `CONTRIBUTING.md` §2. Empieza
cuando el Spec 1 esté en `develop`; la parte de reportes depende de las tablas de los specs 2 y 3. Descripción
sugerida para `/speckit-specify`:

> Spec 4 del equipo: promociones, antifraude y reportes. Cupones de bono de depósito, apuesta gratis y aumento de
> cuota con vigencia, cupo, límite por usuario, rollover y controles anti-abuso por usuario, dispositivo y método de
> pago, expuestos a las apuestas mediante PromocionesApuestaPort. Reglas de detección de fraude (cuentas múltiples,
> apuestas anómalas, retiro inmediato tras depósito) con alertas y RiesgoPort para retiros. Servicio de reportes en
> Python con usuario de solo lectura y token de administrador, métricas de volumen, GGR, pagos, depósitos, retiros,
> usuarios activos, cupones y fraude, filtros y exportación CSV/PDF, y dashboard en la web.

## 3. Te pertenece

- `apps/api/src/promociones/`, `apps/api/src/fraude/`.
- `apps/api/prisma/schema/promociones.prisma` y sus migraciones.
- `apps/reports/` completo (agrega pandas aquí, no antes).
- `apps/web/src/app/admin/reportes/`, `apps/web/src/app/operador/cupones/`, `apps/web/src/app/admin/alertas/`.

## 4. Contratos

**Provees**: `PROMOCIONES_APUESTA_PORT` y `RIESGO_PORT` (contrato 4).

**Consumes**: guard y decoradores (1), `BILLETERA_PORT` para bonos y rollover (2), auditoría (3), los cinco
eventos de dominio (5), el JWT (6) y las tablas de los specs 2 y 3 en solo lectura (7).

## 5. Vectores de fraude que tu spec debe mitigar (y probar)

| Vector | Prueba obligatoria |
|--------|-------------------|
| Reutilizar un cupón | El segundo canje del mismo usuario, dispositivo o método de pago se rechaza |
| Canje concurrente | N canjes simultáneos no superan el cupo total |
| Retirar un bono sin rollover | El saldo de bono no pasa a real hasta cumplir el rollover |
| Cupón vencido o agotado | Se rechaza con un motivo legible |
| Cuentas múltiples | Dos registros desde el mismo dispositivo generan alerta |
| Escritura desde reportes | Ninguna ruta de reportes escribe; el usuario de BD lo impide (ya probado en el Spec 1) |
| Reportes sin ser administrador | Token ausente, vencido o sin rol `ADMINISTRADOR` → 401/403 |

## 6. Variables de entorno nuevas

API: `CUPON_ROLLOVER_MULTIPLICADOR`, umbrales de las reglas de fraude. Reportes: `JWT_PUBLIC_KEY`, `JWT_ISSUER`,
`JWT_AUDIENCE`. Agrégalas a sus validaciones, `.env.example` y `contracts/configuracion.md` del Spec 1.

## 7. Plan de PRs

1. **PR 1**: cupones, rollover y `PromocionesApuestaPort`.
2. **PR 2**: reglas de fraude, alertas y `RiesgoPort`.
3. **PR 3**: reportes, dashboard y exportación.
4. **Cierre**: `release/1.0` → `main` y tag `v1.0.0`.
