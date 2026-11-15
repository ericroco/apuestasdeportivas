# Quickstart: Partidos, apuestas y liquidación

Cómo levantar y probar el Spec 3 en local. Requiere lo del quickstart del Spec 1 (Node 22, pnpm, Docker, uv). En
Windows, todos los comandos desde PowerShell.

## 1. Arranque

```powershell
docker compose up -d                      # PostgreSQL y Redis
pnpm install
pnpm db:migrate                           # incluye la migración spec3_*
pnpm --filter api seed:partidos           # competiciones, partidos y mercados de demostración
pnpm dev                                  # web :3000, api :3001, reports :8000
```

En `apps/api/.env` deja `API_FOOTBALL_SIMULACION=true` (por defecto): no se consulta API-Football y no hace falta
clave. Para probar contra la API real: `API_FOOTBALL_SIMULACION=false`, `API_FOOTBALL_KEY=<tu clave>` y
`API_FOOTBALL_LIGAS=<ids>`; vigila el consumo en el panel del operador.

Mientras el Spec 2 no esté en `develop` no hay login real: las pruebas e2e usan un guard de prueba y la demo
manual espera a que entre la autenticación.

## 2. Demostración en modo simulación (SC-008, menos de 2 minutos)

1. Como operador, en **Operador → Partidos**, abre un partido sembrado y revisa sus mercados y cuotas.
2. Como apostador, en **Partidos**, agrega "gana el local" al boleto, escribe `10.00` y pulsa
   **Confirmar apuesta**. La apuesta aparece pendiente en **Mis apuestas**.
3. Como operador, en **Operador → Simulación**, envía `INICIO`, luego `GOL` del local y luego `FINAL`.
4. En **Mis apuestas**, sin recargar, la apuesta pasa a ganada y muestra el premio (≤ 5 s).
5. Envía otra vez `FINAL`: el saldo no cambia (idempotencia).

Suspensión: con otro partido, envía `INICIO` y `SUSPENSION`. Para no esperar 48 h, arranca la API con
`SUSPENSION_PLAZO_HORAS=0.01` (36 s): al vencer, las apuestas se reembolsan una sola vez.

## 3. Pruebas

```powershell
pnpm --filter api test:unit                                          # reglas puras: estados, mercados, cálculos
pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts    # integración con PostgreSQL y Redis
pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/apuestas-concurrencia.e2e-spec.ts
pnpm --filter web test
$env:E2E_WEB_PORT=3100; pnpm test:e2e                                # Playwright (criterio de cierre de F4)
```

Pruebas obligatorias por la constitución (IV), todas en `apps/api/test/`:

| Prueba | Archivo |
|--------|---------|
| Apostar sin saldo, tras el inicio, con cuota alterada, fuera de límites | `apuestas-abuso.e2e-spec.ts` |
| 20 apuestas simultáneas del mismo usuario (SC-004) | `apuestas-concurrencia.e2e-spec.ts` |
| Reprocesar 5 veces el mismo resultado (SC-003) | `liquidacion-idempotencia.e2e-spec.ts` |
| Aplazado fuera de plazo reembolsa una vez (SC-006) | `suspensiones.e2e-spec.ts` |
| Retardo en vivo y revalidación | `apuestas-vivo.e2e-spec.ts` |
| El worker no supera el presupuesto (SC-005) | `sincronizacion-presupuesto.e2e-spec.ts` |
| Sin rutas de edición o borrado de apuestas | `apuestas-inmutables.e2e-spec.ts` |
| Corrección con reversión de premio | `reliquidacion.e2e-spec.ts` |
