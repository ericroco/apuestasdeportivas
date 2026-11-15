"""Tablas y datos de prueba de reportes (contracts/reportes.md §3) para la prueba de integración.

Se crean en el esquema que tenga primero el `search_path` de la conexión del dueño. Los tipos
imitan lo que generan Prisma y las migraciones: uuid, enums, Decimal(14,2) y timestamptz.

Cálculo a mano de los datos conocidos en el rango 2026-12-01..2026-12-03: apuestas no anuladas
A1, A2, A3, A5 y A8 → 5 apuestas, volumen 55.00, premios 41.00, GGR (10 + 20 + 7.75 + 12) - 41 =
8.75 y 3 usuarios activos (U4 solo tiene una anulada).
"""

from collections.abc import Iterable
from typing import Any, Final, LiteralString

import psycopg

Conexion = psycopg.Connection[Any]

USUARIO_ANA = "11111111-1111-4111-8111-111111111111"
USUARIO_BETO = "22222222-2222-4222-8222-222222222222"
USUARIO_CARO = "33333333-3333-4333-8333-333333333333"
USUARIO_DANI = "44444444-4444-4444-8444-444444444444"
COMPETICIONES = (
    "c1000000-0000-4000-8000-000000000001",
    "c2000000-0000-4000-8000-000000000002",
    "c3000000-0000-4000-8000-000000000003",
)
PARTIDOS = (
    "a1000000-0000-4000-8000-000000000001",
    "a2000000-0000-4000-8000-000000000002",
    "a3000000-0000-4000-8000-000000000003",
)

TIPOS: Final = """
CREATE TYPE estado_apuesta AS ENUM ('PENDIENTE', 'GANADA', 'PERDIDA', 'ANULADA');
CREATE TYPE estado_canje AS ENUM ('ACEPTADO', 'RECHAZADO');
CREATE TYPE estado_alerta AS ENUM ('ABIERTA', 'CONFIRMADA', 'DESCARTADA');
CREATE TYPE severidad_alerta AS ENUM ('MEDIA', 'ALTA');
"""

DDL: dict[str, LiteralString] = {
    "usuario": "CREATE TABLE usuario (id uuid PRIMARY KEY, email text NOT NULL UNIQUE)",
    "competicion": """CREATE TABLE competicion (
        id uuid PRIMARY KEY, nombre text NOT NULL, deporte text NOT NULL DEFAULT 'futbol')""",
    "partido": """CREATE TABLE partido (
        id uuid PRIMARY KEY, competicion_id uuid NOT NULL REFERENCES competicion (id));
        CREATE INDEX ON partido (competicion_id)""",
    "apuesta": """CREATE TABLE apuesta (
        id uuid PRIMARY KEY, usuario_id text NOT NULL, monto numeric(14, 2) NOT NULL,
        estado estado_apuesta NOT NULL DEFAULT 'PENDIENTE',
        premio_pagado numeric(14, 2) NOT NULL DEFAULT 0, aceptada_en timestamptz NOT NULL);
        CREATE INDEX ON apuesta (usuario_id, aceptada_en)""",
    "seleccion_apostada": """CREATE TABLE seleccion_apostada (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        apuesta_id uuid NOT NULL REFERENCES apuesta (id),
        partido_id uuid NOT NULL REFERENCES partido (id), UNIQUE (apuesta_id, partido_id))""",
    "deposito": """CREATE TABLE deposito (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id text NOT NULL,
        monto numeric(14, 2) NOT NULL, estado text NOT NULL, confirmado_en timestamptz)""",
    "retiro": """CREATE TABLE retiro (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id text NOT NULL,
        monto numeric(14, 2) NOT NULL, estado text NOT NULL, pagado_en timestamptz)""",
    "canje_cupon": """CREATE TABLE canje_cupon (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cupon_id uuid, usuario_id text NOT NULL,
        estado estado_canje NOT NULL, creado_en timestamptz NOT NULL)""",
    "bono": """CREATE TABLE bono (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id text NOT NULL,
        canje_id uuid NOT NULL UNIQUE REFERENCES canje_cupon (id),
        monto numeric(14, 2) NOT NULL)""",
    "alerta_fraude": """CREATE TABLE alerta_fraude (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id text NOT NULL,
        severidad severidad_alerta NOT NULL, estado estado_alerta NOT NULL DEFAULT 'ABIERTA',
        creada_en timestamptz NOT NULL)""",
}
TABLAS = tuple(DDL)

U1, U2, U3, U4 = USUARIO_ANA, USUARIO_BETO, USUARIO_CARO, USUARIO_DANI
C1, C2, C3 = COMPETICIONES
P1, P2, P3 = PARTIDOS

# (id, usuario, monto, estado, premio pagado, aceptada en, partidos)
APUESTAS: list[tuple[str, str, str, str, str, str, tuple[str, ...]]] = [
    ("b0000000-0000-4000-8000-000000000001", U1, "10.00", "GANADA", "25.50",
     "2026-12-01T10:00:00Z", (P1,)),
    ("b0000000-0000-4000-8000-000000000002", U1, "20.00", "PERDIDA", "0",
     "2026-12-01T23:59:59Z", (P1, P2)),
    ("b0000000-0000-4000-8000-000000000003", U2, "5.25", "PENDIENTE", "0",
     "2026-12-02T00:00:00Z", (P3,)),
    ("b0000000-0000-4000-8000-000000000004", U4, "100.00", "ANULADA", "0",
     "2026-12-02T12:00:00Z", (P1,)),
    ("b0000000-0000-4000-8000-000000000005", U3, "7.75", "GANADA", "15.50",
     "2026-12-03T23:59:59.999Z", (P3,)),
    ("b0000000-0000-4000-8000-000000000006", U1, "50.00", "PERDIDA", "0",
     "2026-11-30T23:59:59Z", (P1,)),
    ("b0000000-0000-4000-8000-000000000007", U3, "40.00", "GANADA", "80.00",
     "2026-12-04T00:00:00Z", (P2,)),
    ("b0000000-0000-4000-8000-000000000008", U2, "12.00", "PERDIDA", "0",
     "2026-12-02T08:00:00Z", (P2,)),
]  # fmt: skip

DEPOSITOS = [
    (U1, "100.00", "CONFIRMADO", "2026-12-01T09:00:00Z"),
    (U2, "50.50", "CONFIRMADO", "2026-12-03T10:00:00Z"),
    (U1, "30.00", "PENDIENTE", None),
    (U3, "70.00", "CONFIRMADO", "2026-12-04T00:00:00Z"),
    (U2, "25.00", "RECHAZADO", "2026-12-02T10:00:00Z"),
]
RETIROS = [
    (U1, "40.00", "PAGADO", "2026-12-02T15:00:00Z"),
    (U2, "10.00", "SOLICITADO", None),
    (U3, "5.00", "PAGADO", "2026-11-30T12:00:00Z"),
]
# (id, usuario, estado, creado en, monto del bono o None)
CANJES = [
    ("d0000000-0000-4000-8000-000000000001", U1, "ACEPTADO", "2026-12-01T09:00:01Z", "10.00"),
    ("d0000000-0000-4000-8000-000000000002", U2, "RECHAZADO", "2026-12-02T09:00:00Z", None),
    ("d0000000-0000-4000-8000-000000000003", U3, "ACEPTADO", "2026-12-03T09:00:00Z", None),
    ("d0000000-0000-4000-8000-000000000004", U2, "ACEPTADO", "2026-12-05T09:00:00Z", "5.00"),
    ("d0000000-0000-4000-8000-000000000005", U1, "RECHAZADO", "2026-12-02T10:00:00Z", None),
    ("d0000000-0000-4000-8000-000000000006", U3, "ACEPTADO", "2026-12-02T11:00:00Z", "2.50"),
]
ALERTAS = [
    (U1, "ALTA", "ABIERTA", "2026-12-01T12:00:00Z"),
    (U2, "MEDIA", "CONFIRMADA", "2026-12-02T12:00:00Z"),
    (U3, "ALTA", "DESCARTADA", "2026-12-03T12:00:00Z"),
    (U1, "MEDIA", "ABIERTA", "2026-12-03T13:00:00Z"),
    (U2, "ALTA", "ABIERTA", "2026-12-10T12:00:00Z"),
]


def crear_tablas(conexion: Conexion, omitir: set[str]) -> None:
    conexion.execute(TIPOS)
    for tabla, sentencia in DDL.items():
        if tabla not in omitir:
            conexion.execute(sentencia)


def _insertar(
    conexion: Conexion, sentencia: LiteralString, filas: Iterable[tuple[object, ...]]
) -> None:
    with conexion.cursor() as cursor:
        cursor.executemany(sentencia, list(filas))


def _apuestas(conexion: Conexion) -> None:
    _insertar(
        conexion,
        "INSERT INTO apuesta (id, usuario_id, monto, estado, premio_pagado, aceptada_en)"
        " VALUES (%s, %s, %s, %s, %s, %s)",
        (fila[:6] for fila in APUESTAS),
    )
    _insertar(
        conexion,
        "INSERT INTO seleccion_apostada (apuesta_id, partido_id) VALUES (%s, %s)",
        ((fila[0], partido) for fila in APUESTAS for partido in fila[6]),
    )


def cargar_datos_conocidos(conexion: Conexion, omitir: set[str]) -> None:
    cargas: dict[str, tuple[LiteralString, list[tuple[object, ...]]]] = {
        "usuario": (
            "INSERT INTO usuario (id, email) VALUES (%s, %s)",
            [(U1, "ana@example.com"), (U2, "beto@example.com"), (U3, "caro@example.com"),
             (U4, "dani@example.com")],
        ),
        "competicion": (
            "INSERT INTO competicion (id, nombre, deporte) VALUES (%s, %s, %s)",
            [(C1, "LigaPro", "futbol"), (C2, "Serie A", "futbol"), (C3, "NBA", "baloncesto")],
        ),
        "partido": (
            "INSERT INTO partido (id, competicion_id) VALUES (%s, %s)",
            [(P1, C1), (P2, C2), (P3, C3)],
        ),
        "deposito": (
            "INSERT INTO deposito (usuario_id, monto, estado, confirmado_en)"
            " VALUES (%s, %s, %s, %s)",
            list(DEPOSITOS),
        ),
        "retiro": (
            "INSERT INTO retiro (usuario_id, monto, estado, pagado_en) VALUES (%s, %s, %s, %s)",
            list(RETIROS),
        ),
        "canje_cupon": (
            "INSERT INTO canje_cupon (id, usuario_id, estado, creado_en) VALUES (%s, %s, %s, %s)",
            [fila[:4] for fila in CANJES],
        ),
        "bono": (
            "INSERT INTO bono (usuario_id, canje_id, monto) VALUES (%s, %s, %s)",
            [(fila[1], fila[0], fila[4]) for fila in CANJES if fila[4] is not None],
        ),
        "alerta_fraude": (
            "INSERT INTO alerta_fraude (usuario_id, severidad, estado, creada_en)"
            " VALUES (%s, %s, %s, %s)",
            list(ALERTAS),
        ),
    }  # fmt: skip
    for tabla, (sentencia, filas) in cargas.items():
        if tabla not in omitir:
            _insertar(conexion, sentencia, filas)
        if tabla == "partido" and "apuesta" not in omitir:
            _apuestas(conexion)


VOLUMEN: Final = """
INSERT INTO competicion (id, nombre, deporte)
VALUES (gen_random_uuid(), 'Liga Volumen', 'futbol'), (gen_random_uuid(), 'Canasta', 'baloncesto');
INSERT INTO partido (id, competicion_id)
SELECT gen_random_uuid(), c.id FROM competicion c CROSS JOIN generate_series(1, 15);
-- 100 000 apuestas repartidas en diciembre: 25 000 de cada estado; las ganadas pagan 18.50.
INSERT INTO apuesta (id, usuario_id, monto, estado, premio_pagado, aceptada_en)
SELECT gen_random_uuid(), 'usuario-' || (g % 2000), 10.00,
       (ARRAY['GANADA', 'PERDIDA', 'PENDIENTE', 'ANULADA']::estado_apuesta[])[1 + g % 4],
       CASE WHEN g % 4 = 0 THEN 18.50 ELSE 0 END,
       timestamptz '2026-12-01 00:00:00+00' + g * 26 * interval '1 second'
FROM generate_series(1, 100000) AS g;
WITH a AS (SELECT id, row_number() OVER (ORDER BY id) AS n FROM apuesta),
     p AS (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM partido)
INSERT INTO seleccion_apostada (apuesta_id, partido_id)
SELECT a.id, p.id FROM a JOIN p ON p.n = a.n % 30
UNION ALL
SELECT a.id, p.id FROM a JOIN p ON p.n = (a.n + 1) % 30 WHERE a.n % 3 = 0;
INSERT INTO deposito (usuario_id, monto, estado, confirmado_en)
SELECT 'usuario-' || (g % 2000), 20.00, 'CONFIRMADO',
       timestamptz '2026-12-01 00:00:00+00' + g * 500 * interval '1 second'
FROM generate_series(1, 5000) AS g;
INSERT INTO retiro (usuario_id, monto, estado, pagado_en)
SELECT 'usuario-' || (g % 2000), 15.00, 'PAGADO',
       timestamptz '2026-12-01 00:00:00+00' + g * 2500 * interval '1 second'
FROM generate_series(1, 1000) AS g;
INSERT INTO canje_cupon (usuario_id, estado, creado_en)
SELECT 'usuario-' || g, CASE WHEN g % 5 = 0 THEN 'RECHAZADO' ELSE 'ACEPTADO' END::estado_canje,
       timestamptz '2026-12-01 00:00:00+00' + g * 2600 * interval '1 second'
FROM generate_series(1, 1000) AS g;
INSERT INTO alerta_fraude (usuario_id, severidad, estado, creada_en)
SELECT 'usuario-' || g, 'MEDIA', 'ABIERTA',
       timestamptz '2026-12-01 00:00:00+00' + g * 5000 * interval '1 second'
FROM generate_series(1, 500) AS g;
ANALYZE;
"""


def cargar_volumen(conexion: Conexion) -> None:
    conexion.execute(VOLUMEN)
