# Quickstart: Partidos, apuestas y liquidación

Cómo levantar y probar el Spec 3 en local. Requiere lo del quickstart del Spec 1 (Node 22, pnpm, Docker, uv). En
Windows, todos los comandos desde PowerShell.

## 1. Arranque

```powershell
docker compose up -d                      # PostgreSQL, Redis y Mailpit (buzón de correos de prueba)
pnpm install
pnpm db:migrate                           # incluye la migración spec3_*
pnpm --filter api seed:partidos           # competiciones, partidos y mercados de demostración
```

Configuración local (una sola vez; los tres archivos están en `.gitignore`):

- `apps/api/.env`: copia de `apps/api/.env.example` con los secretos de `pnpm --filter api exec tsx
  scripts/generar-secretos.ts`. Deja `API_FOOTBALL_SIMULACION=true` (por defecto): no se consulta API-Football y no
  hace falta clave.
- `apps/web/.env.local`: copia de `apps/web/.env.example` con el **mismo** `WEB_PROXY_SECRETO` de `apps/api/.env`.
- `apps/reports/.env`: copia de `apps/reports/.env.example` con la **misma** `JWT_PUBLIC_KEY` de `apps/api/.env`.

```powershell
pnpm dev                                  # web :3000, api :3001, reports :8000
```

Si `pnpm` solo existe vía corepack, antepone `corepack` a cada comando (`corepack pnpm dev`).

Para probar contra la API real: `API_FOOTBALL_SIMULACION=false`, `API_FOOTBALL_KEY=<tu clave>` y
`API_FOOTBALL_LIGAS=242` (Liga Pro Ecuador); vigila el consumo en **Operador → Consumo del proveedor**. El plan
gratuito tiene 100 consultas al día y 10 por minuto (research.md §2).

### Cuentas de ejemplo

Con todo corriendo (`pnpm dev` y Docker), en otra terminal:

```powershell
pnpm --filter api demo:cuentas            # crea las cuentas y guarda las credenciales
```

Crea, por la web y como lo haría una persona:

| Cuenta | Para qué | Detalle |
|---|---|---|
| `admin@demo.local` | Panel del operador (el administrador también es operador) | Segundo factor ya activado |
| `apostador@demo.local` | Cartelera, boleto, mis apuestas y billetera | Correo confirmado y 100.00 USD de saldo de prueba |

Las contraseñas son aleatorias y quedan en `apps/api/.env.cuentas-demo` (ignorado por git; no lo compartas). Si
el archivo ya existe, el script no crea nada. El saldo es un asiento de depósito de prueba, porque Payphone sandbox
no está configurado en local.

El administrador pide un código de 6 dígitos al iniciar sesión. Dos opciones:

- En el celular: Google o Microsoft Authenticator → **Ingresar clave de configuración** → pega `ADMIN_TOTP_SECRETO`
  del archivo (basada en tiempo).
- En la PC: `pnpm --filter api demo:codigo` imprime el código vigente (cambia cada 30 s).

## 2. Demostración en modo simulación (SC-008, menos de 2 minutos)

Usa dos navegadores (o uno normal y otro en incógnito): las pestañas de un mismo navegador comparten la sesión.

1. Como apostador, en **Partidos**, abre un partido de "LigaPro (demo)", elige la cuota del local, escribe `10` en
   el boleto y pulsa **Confirmar apuesta**. La apuesta aparece pendiente en **Mis apuestas** y el saldo baja en
   **Mi cuenta → Billetera**.
2. Como administrador, en `http://localhost:3000/operador/simulacion`, pulsa **Pitazo inicial** y luego **Gol** del
   local en ese partido. En la página del partido del apostador el marcador cambia sin recargar y se cierran los
   mercados que no admiten apuestas en vivo.
3. Pulsa **Pitazo final**. En **Mis apuestas** la apuesta pasa a ganada con el premio (≤ 5 s) y la billetera
   muestra el depósito, la apuesta y el premio.
4. Otras pantallas del operador: `/operador/partidos` (alta de partidos y cuotas) y `/operador/consumo`.

Suspensión: con otro partido, pulsa **Pitazo inicial** y **Suspender**. Para no esperar 48 h, arranca la API con
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

## 4. Mediciones

| Medición | Valor | Cómo se midió |
|----------|-------|---------------|
| Latencia resultado → aviso al apostador (SC-001, meta ≤ 5 s) | **45 ms** | `test/liquidacion.e2e-spec.ts`, en local: desde que el operador carga el resultado hasta que el navegador del dueño recibe `apuesta.liquidada` por WebSocket (incluye la cola de liquidación y la transacción de la billetera) |
| Demora de detección con la API real | Pendiente | Necesita una clave de API-Football (T029). Con 100 consultas diarias, el intervalo en vivo lo fija la frecuencia adaptativa (mínimo 15 s), así que la detección domina la latencia total |
| Cobertura de la API (unitarias + integración) | 90 % de sentencias | `pnpm --filter api test`, informe en `apps/api/coverage/` |

La latencia se mide desde que el sistema **detecta** el resultado, no desde que API-Football lo publica (ver la
desviación registrada en `plan.md`, Complexity Tracking).
