# Variables de entorno nuevas del Spec 3

Se agregan a `apps/api/src/config/env.ts` (validadas con zod al arrancar), a `apps/api/.env.example` y a
`specs/001-fundaciones-stack/contracts/configuracion.md`. Los montos se validan como decimales positivos con hasta
dos decimales.

## `apps/api`

| Variable | Obligatoria | Por defecto | Uso |
|----------|-------------|-------------|-----|
| `API_FOOTBALL_SIMULACION` | no | `true` | `true`: modo simulación, no se consulta al proveedor |
| `API_FOOTBALL_KEY` | solo si `API_FOOTBALL_SIMULACION=false` | — | **secreto**; solo en el backend |
| `API_FOOTBALL_BASE_URL` | no | `https://v3.football.api-sports.io` | |
| `API_FOOTBALL_PRESUPUESTO_DIARIO` | no | `100` | consultas por día UTC; nunca se supera |
| `API_FOOTBALL_LIGAS` | si `API_FOOTBALL_SIMULACION=false` | — | ids de ligas a importar, separados por comas |
| `APUESTA_MONTO_MIN` | no | `0.50` | |
| `APUESTA_MONTO_MAX` | no | `500.00` | |
| `APUESTA_LIMITE_DIARIO_USUARIO` | no | `1000.00` | monto total por usuario y día (America/Guayaquil) |
| `APUESTA_GANANCIA_MAX` | no | `5000.00` | ganancia potencial máxima por apuesta |
| `APUESTA_MAX_SELECCIONES` | no | `10` | máximo de selecciones en una combinada (mínimo fijo: 2) |
| `APUESTA_RETARDO_VIVO_MS` | no | `5000` | retardo de aceptación en vivo |
| `SUSPENSION_PLAZO_HORAS` | no | `48` | plazo para reanudar o jugar un partido suspendido o aplazado |

Reglas cruzadas validadas al arrancar: `APUESTA_MONTO_MIN` ≤ `APUESTA_MONTO_MAX` ≤
`APUESTA_LIMITE_DIARIO_USUARIO`, y `API_FOOTBALL_KEY` y `API_FOOTBALL_LIGAS` presentes cuando la simulación está
apagada. El mensaje de error nombra la variable sin mostrar su valor (como en el Spec 1).

## `apps/web`

| Variable | Obligatoria | Por defecto | Uso |
|----------|-------------|-------------|-----|
| `NEXT_PUBLIC_WS_URL` | no | `http://localhost:3001` | URL del gateway de tiempo real (no es secreto) |
