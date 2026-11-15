# Contrato REST del Spec 4 (apps/api)

Todas las rutas llevan el prefijo `/api` y exigen sesión (guard global del Spec 2, contrato 1) **y** el guard local
`RolesGuard` del Spec 4, que deniega con 401 si no hay `request.user` y con 403 si falta el rol. Entrada validada con
zod `.strict()` (`StandardSchemaValidationPipe`); montos, porcentajes y cuotas viajan como **texto decimal**
(`"10.50"`). Fechas en ISO 8601 UTC. Listas paginadas: `pagina` (desde 1) y `tamano` (1–100, por defecto 20).

## Errores

Formato uniforme del Spec 1 con un `codigo` estable:

```json
{ "statusCode": 409, "error": "Conflict", "codigo": "CUPON_CON_CANJES", "message": "…" }
```

| Código | HTTP | Cuándo |
|--------|------|--------|
| `DATOS_INVALIDOS` | 400 | validación zod; `message` nombra el campo |
| `CODIGO_DUPLICADO` | 409 | ya existe un cupón con ese código (sin distinguir mayúsculas) |
| `CUPON_CON_CANJES` | 409 | se intenta cambiar tipo, valor, condiciones, inicio o límite de un cupón con canjes |
| `CAMBIO_NO_PERMITIDO` | 409 | se intenta acortar la vigencia o reducir el cupo |
| `NO_ENCONTRADO` | 404 | cupón o alerta inexistente |
| `ALERTA_RESUELTA` | 409 | la alerta ya fue confirmada o descartada |
| `DEPENDENCIA_NO_DISPONIBLE` | 503 | billetera o auditoría del Spec 2 no integradas |

## Cupones (rol OPERADOR o ADMINISTRADOR)

### `POST /cupones`

```json
{
  "codigo": "BIENVENIDA10",
  "tipo": "BONO_DEPOSITO",
  "porcentaje": "100.00",
  "topeBono": "10.00",
  "depositoMinimo": "10.00",
  "iniciaEn": "2026-12-01T00:00:00Z",
  "terminaEn": "2027-01-31T23:59:59Z",
  "cupoTotal": 500,
  "limitePorUsuario": 1
}
```

Campos por tipo: `BONO_DEPOSITO` → `porcentaje` (1–200), `topeBono`, `depositoMinimo`; `APUESTA_GRATIS` →
`montoFijo`; `AUMENTO_CUOTA` → `porcentaje` (1–100), `apuestaMaxima`. Un campo que no corresponde al tipo se
rechaza. `201` con la vista del cupón. Auditoría `cupon.creado`.

**Vista del cupón** (respuesta de todas las rutas de cupones):

```json
{
  "id": "…", "codigo": "BIENVENIDA10", "tipo": "BONO_DEPOSITO",
  "porcentaje": "100.00", "montoFijo": null, "topeBono": "10.00", "depositoMinimo": "10.00", "apuestaMaxima": null,
  "iniciaEn": "…", "terminaEn": "…", "cupoTotal": 500, "limitePorUsuario": 1,
  "canjes": 0, "estado": "ACTIVO", "vigente": true, "creadoEn": "…"
}
```

### `GET /cupones?estado=&tipo=&busqueda=&pagina=&tamano=`

`{ "datos": [VistaCupon], "total": 12, "pagina": 1, "tamano": 20 }`, del más reciente al más antiguo. `busqueda`
filtra por código (prefijo, sin distinguir mayúsculas).

### `GET /cupones/:id`

Vista del cupón más `{ "resumenCanjes": { "aceptados": 40, "rechazados": 3, "bonoOtorgado": "400.00" } }`.

### `PATCH /cupones/:id`

Siempre permitidos: `estado` (`ACTIVO`/`PAUSADO`), `terminaEn` (solo posterior a la actual) y `cupoTotal` (solo
mayor). Con `canjes = 0` también: `tipo`, campos del tipo, `iniciaEn` y `limitePorUsuario`. Auditoría
`cupon.actualizado` con el antes y el después, o `cupon.pausado` / `cupon.reactivado`.

## Apostador (cualquier usuario autenticado)

### `GET /cupones/vista-previa/:codigo`

No consume el cupón. Evalúa las reglas que no dependen de la operación (existencia, estado, vigencia, cupo, límite
del usuario, bono activo, usuario en revisión, cuenta múltiple por dispositivo).

```json
{
  "codigo": "BIENVENIDA10", "tipo": "BONO_DEPOSITO",
  "descripcion": "Bono del 100 % de tu depósito, hasta 10.00. Depósito mínimo 10.00.",
  "terminaEn": "…", "puedeUsar": false,
  "motivo": { "codigo": "BONO_ACTIVO", "mensaje": "Ya tienes un bono activo; termina su rollover antes de usar otro." }
}
```

Un código inexistente responde `200` con `puedeUsar: false` y `CUPON_INEXISTENTE` (no revela más). Limitado a 10
consultas por minuto por usuario (enumeración de códigos).

### `GET /bonos/mios`

```json
{
  "activo": {
    "id": "…", "monto": "10.00", "requisito": "50.00", "avance": "12.50", "porcentajeAvance": 25,
    "estado": "ACTIVO", "otorgadoEn": "…", "venceEn": "…", "codigoCupon": "BIENVENIDA10"
  },
  "historial": [ { "…": "bonos cumplidos o vencidos, con montoConvertido y cumplidoEn" } ],
  "canjesRechazados": [ { "codigo": "BIENVENIDA10", "motivo": { "codigo": "DEPOSITO_INSUFICIENTE", "mensaje": "…" }, "creadoEn": "…" } ],
  "cuotaMinima": "1.50"
}
```

## Alertas (rol ADMINISTRADOR)

### `GET /alertas?estado=&severidad=&regla=&usuarioId=&desde=&hasta=&pagina=&tamano=`

`{ "datos": [VistaAlerta], "total": 3, "pagina": 1, "tamano": 20 }`, de la más reciente a la más antigua.

```json
{
  "id": "…", "regla": "CUENTAS_DISPOSITIVO", "severidad": "ALTA", "usuarioId": "…",
  "evidencia": { "dispositivo": "…", "cuentas": ["…", "…"] },
  "estado": "ABIERTA", "nota": null, "resueltaPor": null, "resueltaEn": null, "creadaEn": "…"
}
```

### `GET /alertas/:id`

La vista de la alerta.

### `POST /alertas/:id/resolucion`

`{ "estado": "CONFIRMADA", "nota": "Mismo titular en ambas cuentas" }` (`nota` de 5 a 500 caracteres). `200` con la
alerta resuelta. La actualización es condicional (`WHERE estado = 'ABIERTA'`): dos resoluciones simultáneas dejan
una sola. Auditoría `alerta.resuelta`.

## Puertos que provee (contrato 4)

- `PROMOCIONES_APUESTA_PORT.aplicarAApuesta(tx, solicitud)`: ver `research.md` §1–§2. Lanza `CuponInvalidoError`
  con el **mensaje** de la tabla de motivos de `data-model.md`; el Spec 3 lo devuelve como `CUPON_INVALIDO`.
- `RIESGO_PORT.evaluarRetiro(usuarioId, monto)`: `{ requiereRevision, motivos }` con motivos
  `retiro_tras_deposito_sin_actividad` y `usuario_con_alerta_de_fraude`; ante un error, `requiereRevision: true` y
  motivo `evaluacion_no_disponible`.

## Eventos que escucha (contrato 5)

| Evento | Efecto |
|--------|--------|
| `usuario.registrado` | actividad `REGISTRO`; reglas de dispositivo e IP |
| `deposito.confirmado` | actividad `DEPOSITO`; regla de método de pago; canje de bono de depósito si trae código |
| `retiro.solicitado` | actividad `RETIRO` |
| `apuesta.aceptada` | actividad `APUESTA_ACEPTADA`; reglas de monto y ráfaga |
| `apuesta.liquidada` | actividad `APUESTA_LIQUIDADA`; avance del rollover y conversión |
