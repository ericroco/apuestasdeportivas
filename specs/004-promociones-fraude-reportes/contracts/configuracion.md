# Variables de entorno nuevas del Spec 4

Se agregan a la validación de cada app, a su `.env.example` y a
`specs/001-fundaciones-stack/contracts/configuracion.md`. Todas son opcionales salvo las de JWT en reportes.

## apps/api

| Variable | Por defecto | Rango | Descripción |
|----------|-------------|-------|-------------|
| `CUPON_ROLLOVER_MULTIPLICADOR` | `5` | 1–50 | Requisito de rollover = bono × multiplicador |
| `CUPON_ROLLOVER_CUOTA_MINIMA` | `1.50` | 1.01–10 | Cuota total mínima para que una apuesta cuente |
| `BONO_VIGENCIA_DIAS` | `30` | 1–365 | Días para cumplir el rollover |
| `FRAUDE_IP_MAX_CUENTAS` | `3` | 1–100 | Cuentas por IP en la ventana antes de alertar |
| `FRAUDE_IP_VENTANA_HORAS` | `24` | 1–720 | Ventana de la regla de IP |
| `FRAUDE_APUESTA_FACTOR` | `10` | 2–1000 | Veces el promedio para alertar por monto |
| `FRAUDE_APUESTA_HISTORIAL_MIN` | `5` | 1–1000 | Apuestas previas necesarias para evaluar el monto |
| `FRAUDE_RAFAGA_MAX_APUESTAS` | `10` | 2–1000 | Apuestas en la ventana antes de alertar |
| `FRAUDE_RAFAGA_VENTANA_SEG` | `60` | 5–3600 | Ventana de la regla de ráfaga |
| `FRAUDE_RETIRO_VENTANA_HORAS` | `24` | 1–720 | Ventana desde el último depósito |
| `FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT` | `50` | 1–1000 | % del depósito que debe apostarse para no alertar |

## apps/reports

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `JWT_PUBLIC_KEY` | **sí** | — | Clave pública PEM de la API (los `\n` escapados se aceptan) |
| `JWT_ALGORITHM` | no | `EdDSA` | `EdDSA` o `RS256`, el mismo que firme el Spec 2 |
| `JWT_ISSUER` | no | `apuestas-api` | Claim `iss` esperado |
| `JWT_AUDIENCE` | no | `apuestas` | Claim `aud` esperado |

## apps/web

Sin variables nuevas: usa `API_URL` y `REPORTS_URL` del Spec 1 desde el servidor.
