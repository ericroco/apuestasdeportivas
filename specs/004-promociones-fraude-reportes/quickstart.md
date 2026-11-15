# Quickstart: Promociones, antifraude y reportes

Requisitos: el entorno del [quickstart del Spec 1](../001-fundaciones-stack/quickstart.md) funcionando
(`docker compose up -d`, `pnpm install`, `pnpm reports:install`). Comandos desde la raíz, en PowerShell.

## 1. Migración y dependencias

```powershell
pnpm install                 # @nestjs/event-emitter
pnpm reports:install         # pandas, PyJWT[crypto], fpdf2
pnpm db:migrate              # crea cupon, canje_cupon, bono, actividad_usuario y alerta_fraude
```

## 2. Variables de entorno

Las de cupones y fraude tienen valores por defecto (`contracts/configuracion.md`). Reportes necesita la clave
pública del JWT. Para desarrollo, mientras el Spec 2 no emita tokens, genera un par Ed25519 de prueba:

```powershell
cd apps/reports
uv run python -m reports.herramientas.clave_dev   # imprime JWT_PUBLIC_KEY para .env y un token de administrador
```

La clave privada de desarrollo nunca se versiona ni se usa fuera de local.

## 3. Pruebas

```powershell
pnpm --filter api exec vitest run src/promociones src/fraude          # dominio con dobles
pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts      # concurrencia e idempotencia con PostgreSQL
cd apps/reports; uv run pytest                                          # JWT, métricas, exportación e integración
pnpm --filter web exec vitest run                                       # componentes y clientes del servidor
```

## 4. Probar a mano

1. `pnpm dev`.
2. Reportes: `curl -H "Authorization: Bearer <token de administrador>" "http://localhost:8000/reportes/resumen?desde=2026-12-01&hasta=2026-12-31"`.
   Sin token debe responder 401; con un token sin `ADMINISTRADOR`, 403.
3. Web: las pantallas `/operador/cupones`, `/admin/alertas`, `/admin/reportes` y `/bonos` necesitan la cookie
   `acceso` del Spec 2. Sin ella muestran "Inicia sesión"; en local se puede fijar la cookie con el token de
   desarrollo del paso 2.
4. Cupones y alertas devuelven 503 `DEPENDENCIA_NO_DISPONIBLE` al escribir hasta que el Spec 2 integre billetera y
   auditoría; las pruebas cubren esos flujos con dobles.

## 5. Escenarios de abuso que deben fallar

| Escenario | Prueba |
|-----------|--------|
| Segundo canje del mismo usuario | `canje.service.spec.ts` |
| 50 canjes simultáneos con cupo 10 | `test/promociones.e2e-spec.ts` |
| Cupón desde el dispositivo de otra cuenta que ya lo usó | `canje.service.spec.ts` |
| Bono apilado | `canje.service.spec.ts` |
| Rollover con cuota 1.20 | `bonos.service.spec.ts` |
| Depósito confirmado dos veces | `test/promociones.e2e-spec.ts` |
| Reportes sin token, vencido o sin rol | `tests/test_seguridad.py` |
| Fórmula en CSV | `tests/test_exportar.py` |
