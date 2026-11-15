"""Consultas de solo lectura de los reportes (contracts/reportes.md §3; FR-027, FR-030).

Único módulo que conoce nombres de tablas y columnas de los specs 2, 3 y 4: si sus nombres finales
cambian, se ajusta solo este archivo. Los valores de los filtros viajan siempre como parámetros de
psycopg; lo único que se compone son fragmentos fijos de SQL e identificadores según qué filtros
vienen. Los estados se comparan como texto para que funcionen con columnas `text` o con enums.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import pandas as pd
import psycopg
from psycopg import IsolationLevel, sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import TupleRow

from reports.filtros import Filtros
from reports.metricas import (
    COLUMNAS_ALERTAS,
    COLUMNAS_APUESTAS_DIA,
    COLUMNAS_CANJES,
    COLUMNAS_COMPETICIONES,
    COLUMNAS_MOVIMIENTOS_DIA,
    MAXIMO_COMPETICIONES,
)

Conexion = psycopg.Connection[TupleRow]

TIMEOUT_CONEXION_S = 5
TIEMPO_MAXIMO_CONSULTA_MS = 15_000


def conectar(url: str) -> Conexion:
    """Conexión de solo lectura con una misma instantánea para todas las consultas del reporte."""
    previas = str(conninfo_to_dict(url).get("options") or "")
    opciones = f"{previas} -c statement_timeout={TIEMPO_MAXIMO_CONSULTA_MS}".strip()
    conexion = psycopg.connect(
        make_conninfo(url, options=opciones), connect_timeout=TIMEOUT_CONEXION_S
    )
    conexion.read_only = True
    conexion.isolation_level = IsolationLevel.REPEATABLE_READ
    return conexion


@dataclass(frozen=True)
class Criterios:
    """Filtros listos para la base: rango [inicio, fin) en UTC y el usuario ya resuelto a su id."""

    inicio: datetime
    fin: datetime
    usuario_id: str | None
    competicion_id: str | None
    deporte: str | None

    @classmethod
    def de(cls, filtros: Filtros, usuario_id: str | None) -> "Criterios":
        return cls(filtros.inicio, filtros.fin, usuario_id, filtros.competicion_id, filtros.deporte)

    def parametros(self) -> dict[str, object]:
        return {
            "inicio": self.inicio,
            "fin": self.fin,
            "usuario_id": self.usuario_id,
            "competicion_id": self.competicion_id,
            "deporte": self.deporte,
        }


def _y(partes: list[sql.Composable]) -> sql.Composable:
    return sql.SQL(" AND ").join(partes) if partes else sql.SQL("TRUE")


def _rango(alias: str, columna: str, criterios: Criterios) -> list[sql.Composable]:
    """Rango por fecha del movimiento y, si hay, filtro por la columna `usuario_id` del alias."""
    fecha = sql.Identifier(alias, columna)
    partes: list[sql.Composable] = [
        sql.SQL("{} >= %(inicio)s").format(fecha),
        sql.SQL("{} < %(fin)s").format(fecha),
    ]
    if criterios.usuario_id is not None:
        partes.append(sql.SQL("{} = %(usuario_id)s").format(sql.Identifier(alias, "usuario_id")))
    return partes


def _de_la_competicion(criterios: Criterios) -> sql.Composable:
    partes: list[sql.Composable] = []
    if criterios.competicion_id is not None:
        partes.append(sql.SQL("c.id = %(competicion_id)s"))
    if criterios.deporte is not None:
        partes.append(sql.SQL("lower(c.deporte) = lower(%(deporte)s)"))
    return _y(partes)


def _apuestas_filtradas(criterios: Criterios) -> sql.Composable:
    """Apuestas no anuladas del rango; con deporte o competición, las con alguna selección allí."""
    partes = [sql.SQL("a.estado::text <> 'ANULADA'"), *_rango("a", "aceptada_en", criterios)]
    if criterios.competicion_id is not None or criterios.deporte is not None:
        partes.append(
            sql.SQL(
                "EXISTS (SELECT 1 FROM seleccion_apostada s"
                " JOIN partido p ON p.id = s.partido_id"
                " JOIN competicion c ON c.id = p.competicion_id"
                " WHERE s.apuesta_id = a.id AND {})"
            ).format(_de_la_competicion(criterios))
        )
    return _y(partes)


def _marco(
    conexion: Conexion, consulta: sql.Composed, criterios: Criterios, columnas: tuple[str, ...]
) -> pd.DataFrame:
    filas: list[Any] = conexion.execute(consulta, criterios.parametros()).fetchall()
    return pd.DataFrame(filas, columns=list(columnas))


def resolver_usuario(conexion: Conexion, correo: str) -> str | None:
    """Id del usuario con ese correo (coincidencia completa, sin distinguir mayúsculas)."""
    fila = conexion.execute(
        "SELECT id::text FROM usuario WHERE lower(email) = lower(%(correo)s) ORDER BY id LIMIT 1",
        {"correo": correo},
    ).fetchone()
    return None if fila is None else str(fila[0])


def apuestas_por_dia(conexion: Conexion, criterios: Criterios) -> pd.DataFrame:
    consulta = sql.SQL(
        "SELECT (a.aceptada_en AT TIME ZONE 'UTC')::date AS fecha, count(*) AS apuestas,"
        " coalesce(sum(a.monto), 0) AS volumen,"
        " coalesce(sum(a.premio_pagado), 0) AS premios_pagados,"
        " coalesce(sum(a.monto) FILTER (WHERE a.estado::text IN ('GANADA', 'PERDIDA')), 0)"
        " AS monto_liquidado"
        " FROM apuesta a WHERE {} GROUP BY 1 ORDER BY 1"
    ).format(_apuestas_filtradas(criterios))
    return _marco(conexion, consulta, criterios, COLUMNAS_APUESTAS_DIA)


def usuarios_activos(conexion: Conexion, criterios: Criterios) -> int:
    consulta = sql.SQL("SELECT count(DISTINCT a.usuario_id) FROM apuesta a WHERE {}").format(
        _apuestas_filtradas(criterios)
    )
    fila = conexion.execute(consulta, criterios.parametros()).fetchone()
    return 0 if fila is None else int(fila[0])


def _movimientos_por_dia(
    conexion: Conexion, criterios: Criterios, tabla: str, estado: str, columna_fecha: str
) -> pd.DataFrame:
    condiciones = _y(
        [
            sql.SQL("m.estado::text = {}").format(sql.Literal(estado)),
            *_rango("m", columna_fecha, criterios),
        ]
    )
    consulta = sql.SQL(
        "SELECT ({fecha} AT TIME ZONE 'UTC')::date AS fecha, count(*) AS cantidad,"
        " coalesce(sum(m.monto), 0) AS monto"
        " FROM {tabla} m WHERE {condiciones} GROUP BY 1 ORDER BY 1"
    ).format(
        fecha=sql.Identifier("m", columna_fecha),
        tabla=sql.Identifier(tabla),
        condiciones=condiciones,
    )
    return _marco(conexion, consulta, criterios, COLUMNAS_MOVIMIENTOS_DIA)


def depositos_por_dia(conexion: Conexion, criterios: Criterios) -> pd.DataFrame:
    """Depósitos `CONFIRMADO` por `confirmado_en`; no tienen deporte ni competición."""
    return _movimientos_por_dia(conexion, criterios, "deposito", "CONFIRMADO", "confirmado_en")


def retiros_por_dia(conexion: Conexion, criterios: Criterios) -> pd.DataFrame:
    """Retiros pagados (`PAGADO`) por `pagado_en`; no tienen deporte ni competición."""
    return _movimientos_por_dia(conexion, criterios, "retiro", "PAGADO", "pagado_en")


def canjes_por_estado(conexion: Conexion, criterios: Criterios) -> pd.DataFrame:
    """Canjes de cupón y bono otorgado por `canje_cupon.creado_en`."""
    consulta = sql.SQL(
        "SELECT cc.estado::text AS estado, count(*) AS cantidad, coalesce(sum(b.monto), 0) AS bono"
        " FROM canje_cupon cc LEFT JOIN bono b ON b.canje_id = cc.id"
        " WHERE {} GROUP BY 1"
    ).format(_y(_rango("cc", "creado_en", criterios)))
    return _marco(conexion, consulta, criterios, COLUMNAS_CANJES)


def alertas_por_estado(conexion: Conexion, criterios: Criterios) -> pd.DataFrame:
    """Alertas de fraude por `creada_en`, contadas por estado y severidad."""
    consulta = sql.SQL(
        "SELECT al.estado::text AS estado, al.severidad::text AS severidad, count(*) AS cantidad"
        " FROM alerta_fraude al WHERE {} GROUP BY 1, 2"
    ).format(_y(_rango("al", "creada_en", criterios)))
    return _marco(conexion, consulta, criterios, COLUMNAS_ALERTAS)


def competiciones(conexion: Conexion, criterios: Criterios) -> pd.DataFrame:
    """Apuestas por competición: una combinada cuenta en cada competición donde tiene selección."""
    consulta = sql.SQL(
        "WITH filtradas AS ("
        " SELECT a.id, a.monto, a.premio_pagado, a.estado::text AS estado FROM apuesta a WHERE {}),"
        " pares AS (SELECT DISTINCT s.apuesta_id, p.competicion_id FROM seleccion_apostada s"
        " JOIN partido p ON p.id = s.partido_id"
        " WHERE s.apuesta_id IN (SELECT id FROM filtradas))"
        " SELECT c.id::text AS competicion_id, c.nombre, c.deporte, count(*) AS apuestas,"
        " coalesce(sum(f.monto), 0) AS volumen,"
        " coalesce(sum(f.premio_pagado), 0) AS premios_pagados,"
        " coalesce(sum(f.monto) FILTER (WHERE f.estado IN ('GANADA', 'PERDIDA')), 0)"
        " AS monto_liquidado"
        " FROM pares JOIN filtradas f ON f.id = pares.apuesta_id"
        " JOIN competicion c ON c.id = pares.competicion_id"
        " WHERE {} GROUP BY c.id, c.nombre, c.deporte"
        " ORDER BY volumen DESC, c.nombre LIMIT {}"
    ).format(
        _apuestas_filtradas(criterios),
        _de_la_competicion(criterios),
        sql.Literal(MAXIMO_COMPETICIONES),
    )
    return _marco(conexion, consulta, criterios, COLUMNAS_COMPETICIONES)
