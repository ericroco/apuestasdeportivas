# Contrato REST del Spec 3

Todas las rutas llevan el prefijo `/api` y exigen sesión (guard global del Spec 2, contrato 1). Entrada validada
con zod `.strict()` (`StandardSchemaValidationPipe`); montos y cuotas viajan como **texto decimal** (`"10.50"`)
para no perder precisión. Fechas en ISO 8601 UTC.

## Errores

Formato uniforme del Spec 1 más un `codigo` estable para que la web muestre un mensaje útil:

```json
{ "statusCode": 422, "error": "Unprocessable Entity", "codigo": "SALDO_INSUFICIENTE", "message": "…" }
```

| Código | HTTP | Cuándo |
|--------|------|--------|
| `CUOTA_CAMBIADA` | 409 | la cuota vista no es la vigente; el cuerpo incluye `cuotasVigentes` |
| `SALDO_INSUFICIENTE` | 422 | la billetera lanzó `SaldoInsuficienteError`; incluye `saldoDisponible` |
| `SALDO_NEGATIVO` | 422 | el usuario tiene saldo negativo por una reversión (FR-038) |
| `MERCADO_CERRADO` | 422 | partido iniciado (reloj del servidor), estado que no admite apuestas o mercado suspendido |
| `LIMITE_EXCEDIDO` | 422 | incluye `limite` (`MONTO_MIN`, `MONTO_MAX`, `DIARIO`, `GANANCIA_MAX`) y `valorPermitido` |
| `COMBINADA_INVALIDA` | 422 | dos selecciones del mismo partido, o menos de 2 o más del máximo |
| `CUPON_INVALIDO` | 422 | el contrato 4 lanzó `CuponInvalidoError` o el Spec 4 no está disponible |
| `TRANSICION_INVALIDA` | 409 | incluye `permitidas` |
| `PARTIDO_CON_APUESTAS` | 409 | intento de borrar; solo se puede cancelar |
| `ROL_NO_PUEDE_APOSTAR` | 403 | el usuario tiene rol OPERADOR o ADMINISTRADOR |

## Cartelera (cualquier usuario autenticado)

| Método | Ruta | Respuesta |
|--------|------|-----------|
| GET | `/partidos?estado=&competicionId=&desde=&hasta=&pagina=` | página de partidos con competición, estado, marcador y hora (máx. 50 por página) |
| GET | `/partidos/:id` | partido con mercados, selecciones, cuotas vigentes y `version` |
| GET | `/competiciones` | lista de competiciones |

## Apuestas (rol APOSTADOR, sin OPERADOR ni ADMINISTRADOR)

### `POST /apuestas`

```json
{
  "claveSolicitud": "8f0c…-uuid",
  "monto": "10.00",
  "selecciones": [{ "seleccionId": "uuid", "cuotaVista": "2.15" }],
  "codigoCupon": "BIENVENIDA"
}
```

- 1 selección = simple; 2 o más = combinada. `codigoCupon` es opcional.
- `201` con la apuesta aceptada; `200` con la misma apuesta si la `claveSolicitud` ya se usó (FR-020).
- `202` con `{ solicitudId, ejecutarEn }` si alguna selección es de un partido en vivo (FR-018); el resultado
  llega por WebSocket (`apuesta.vivo_resuelta`) y en `GET /apuestas/solicitudes-vivo/:id`.
- El servidor ignora cualquier campo de ganancia, cuota total u hora: se rechaza por `.strict()`.

| Método | Ruta | Respuesta |
|--------|------|-----------|
| GET | `/apuestas?estado=&pagina=` | apuestas propias, más recientes primero (máx. 50 por página) |
| GET | `/apuestas/:id` | apuesta propia con sus selecciones y liquidaciones; `404` si es de otro usuario |
| GET | `/apuestas/solicitudes-vivo/:id` | solicitud propia en vivo con su estado y motivo |

## Tiempo real (cualquier usuario autenticado)

| Método | Ruta | Respuesta |
|--------|------|-----------|
| POST | `/tiempo-real/ticket` | `{ ticket, expiraEn }`, de un solo uso y válido 60 s (ver `tiempo-real.md`) |

## Operador (roles OPERADOR o ADMINISTRADOR)

| Método | Ruta | Cuerpo | Notas |
|--------|------|--------|-------|
| POST | `/operador/competiciones` | `{ nombre, pais? }` | |
| POST | `/operador/partidos` | `{ competicionId, nombreLocal, nombreVisitante, inicioEn }` | `inicioEn` futura |
| PATCH | `/operador/partidos/:id` | `{ nombreLocal?, nombreVisitante?, inicioEn? }` | solo en PROGRAMADO |
| POST | `/operador/partidos/:id/estado` | `{ estado, inicioEn?, motivo }` | máquina de estados; `inicioEn` al reprogramar un aplazado |
| POST | `/operador/partidos/:id/marcador` | `{ golesLocal, golesVisitante, minuto? }` | solo EN_VIVO |
| POST | `/operador/partidos/:id/resultado` | `{ golesLocal, golesVisitante, motivo }` | finaliza o corrige (FR-036); `motivo` obligatorio |
| POST | `/operador/partidos/:id/mercados` | `{ tipo, linea?, admiteVivo, selecciones: [{ codigo, cuota }] }` | selecciones completas del tipo |
| PUT | `/operador/selecciones/:id/cuota` | `{ cuota }` | historial + auditoría; marca el mercado como gestionado por el operador |
| POST | `/operador/mercados/:id/suspender` | `{ motivo }` | |
| POST | `/operador/mercados/:id/reabrir` | `{ motivo }` | solo si el partido admite apuestas |
| GET | `/operador/proveedor/consumo` | — | consultas del día, límite y si está agotado |
| POST | `/operador/simulacion/partidos/:id/eventos` | `{ tipo, equipo?, minuto? }` | solo con `API_FOOTBALL_SIMULACION=true` (si no, `404`); `tipo`: `INICIO`, `GOL`, `SUSPENSION`, `REANUDACION`, `APLAZAMIENTO`, `FINAL`, `CANCELACION` |

No existe ninguna ruta `PUT`, `PATCH` ni `DELETE` sobre apuestas (FR-021), ni `DELETE` sobre partidos o mercados
(FR-007).

## Limitación de peticiones

Además del límite global del Spec 1, `POST /apuestas` y `POST /tiempo-real/ticket` llevan un límite propio por
usuario (`@Throttle`) para frenar el abuso automatizado.
