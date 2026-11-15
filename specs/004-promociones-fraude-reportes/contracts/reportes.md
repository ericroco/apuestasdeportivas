# Contrato del servicio de reportes (apps/reports)

Servicio FastAPI que lee PostgreSQL con `reportes_lectura` (solo `SELECT`). Todas las rutas de `/reportes` exigen un
token de administrador; `/health` sigue pública (Spec 1).

## 1. Autenticación (contrato 6)

- Token en `Authorization: Bearer <jwt>` (llamadas servidor a servidor desde Next.js) o en la cookie `acceso`.
- Verificación con `JWT_PUBLIC_KEY` (PEM) y solo el algoritmo de `JWT_ALGORITHM` (`EdDSA` o `RS256`); nunca `none` ni
  HMAC. Claims obligatorios: `sub`, `exp`, `iss = JWT_ISSUER`, `aud = JWT_AUDIENCE`, `roles` (arreglo).
- Sin token, firma inválida, vencido, emisor o audiencia distintos → `401` con `WWW-Authenticate: Bearer`.
  Token válido sin `ADMINISTRADOR` en `roles` → `403`. La validación ocurre antes de abrir una conexión a la base.
- Errores: `{ "detail": { "codigo": "TOKEN_INVALIDO" | "SIN_PERMISO" | "FILTROS_INVALIDOS" | "DATOS_NO_DISPONIBLES", "mensaje": "…" } }`.

## 2. Rutas

Filtros comunes (query): `desde` y `hasta` (fechas `YYYY-MM-DD`, obligatorias, `hasta ≥ desde`, máximo 366 días,
UTC, `hasta` incluido), `deporte`, `competicionId` (uuid) y `usuario` (uuid o correo exacto). Montos como texto con
dos decimales.

### `GET /reportes/resumen`

```json
{
  "filtros": { "desde": "2026-12-01", "hasta": "2026-12-31", "deporte": null, "competicionId": null, "usuario": null },
  "apuestas": { "cantidad": 1520, "volumen": "15200.00", "premiosPagados": "13100.00", "ggr": "1850.00", "usuariosActivos": 87 },
  "depositos": { "cantidad": 210, "monto": "21000.00" },
  "retiros": { "cantidad": 45, "monto": "6400.00" },
  "cupones": { "canjesAceptados": 60, "canjesRechazados": 7, "bonoOtorgado": "540.00" },
  "alertas": { "abiertas": 4, "confirmadas": 2, "descartadas": 5, "altas": 6, "medias": 5 },
  "generadoEn": "2027-01-02T10:00:00Z"
}
```

Definiciones (FR-031): `volumen` = Σ `apuesta.monto` con `estado <> 'ANULADA'` y `aceptada_en` en el rango;
`premiosPagados` = Σ `premio_pagado` de esas apuestas; `ggr` = Σ `monto` de apuestas `GANADA`/`PERDIDA` −
`premiosPagados`; `usuariosActivos` = usuarios distintos con apuestas en el rango; depósitos `CONFIRMADO` por
`confirmado_en`; retiros `PAGADO` por `pagado_en`; canjes y bono por `canje_cupon.creado_en`; alertas por
`creada_en`. Con `deporte` o `competicionId`, apuestas = las que tienen alguna selección de un partido de esa
competición o deporte; depósitos, retiros y cupones no se filtran por deporte ni competición (no tienen). Con
`usuario`, todo se filtra por ese usuario.

### `GET /reportes/serie-diaria`

`{ "filtros": {…}, "dias": [ { "fecha": "2026-12-01", "volumen": "500.00", "premiosPagados": "430.00", "ggr": "70.00", "apuestas": 48, "depositos": "800.00", "retiros": "100.00" } ] }`.
Un elemento por día del rango, con ceros donde no hay datos.

### `GET /reportes/competiciones`

`{ "filtros": {…}, "competiciones": [ { "competicionId": "…", "nombre": "LigaPro", "deporte": "futbol", "apuestas": 300, "volumen": "3000.00", "ggr": "250.00" } ] }`,
ordenado por volumen descendente, máximo 20.

### `GET /reportes/exportar?formato=csv|pdf`

Mismos filtros. `csv`: `text/csv; charset=utf-8` con BOM, secciones "Resumen" y "Serie diaria"; toda celda de texto
que empiece con `=`, `+`, `-`, `@`, tabulador o retorno de carro se prefija con `'`. `pdf`: `application/pdf` con
título, filtros, fecha de generación, tabla de métricas y serie diaria con barras. `Content-Disposition:
attachment; filename="reporte-<desde>-<hasta>.<ext>"`.

## 3. Tablas que lee

`consultas.py` es el único archivo con nombres de tablas. Si una tabla no existe todavía, la ruta responde `503`
`DATOS_NO_DISPONIBLES`.

| Tabla | Spec | Columnas usadas |
|-------|------|-----------------|
| `apuesta` | 3 | `id`, `usuario_id`, `monto`, `estado`, `premio_pagado`, `aceptada_en` |
| `seleccion_apostada` | 3 | `apuesta_id`, `partido_id` |
| `partido` | 3 | `id`, `competicion_id` |
| `competicion` | 3 | `id`, `nombre`, `deporte` (propuesta) |
| `usuario` | 2 (propuesta) | `id`, `email` |
| `deposito` | 2 (propuesta) | `usuario_id`, `monto`, `estado` (`CONFIRMADO`), `confirmado_en` |
| `retiro` | 2 (propuesta) | `usuario_id`, `monto`, `estado` (`PAGADO`), `pagado_en` |
| `canje_cupon`, `bono`, `alerta_fraude` | 4 | ver `data-model.md` |

Las columnas marcadas "propuesta" están en `cambios-contratos.md`.
