"""Arma cada reporte: resuelve el usuario, pide agregados a `consultas` y los deriva con pandas."""

from datetime import datetime

import pandas as pd

from reports import consultas
from reports.consultas import Conexion, Criterios
from reports.filtros import Filtros
from reports.metricas import (
    COLUMNAS_COMPETICIONES,
    DatosResumen,
    construir_competiciones,
    construir_resumen,
    construir_serie,
    marco_vacio,
)
from reports.modelos import RespuestaCompeticiones, RespuestaResumen, RespuestaSerieDiaria


def _criterios(conexion: Conexion, filtros: Filtros) -> Criterios | None:
    """None si el filtro es un correo que no corresponde a ningún usuario: todo da cero."""
    if filtros.correo is None:
        return Criterios.de(filtros, filtros.usuario_id)
    usuario_id = consultas.resolver_usuario(conexion, filtros.correo)
    return None if usuario_id is None else Criterios.de(filtros, usuario_id)


def datos_resumen(conexion: Conexion, criterios: Criterios | None) -> DatosResumen:
    if criterios is None:
        return DatosResumen.vacios()
    return DatosResumen(
        apuestas_por_dia=consultas.apuestas_por_dia(conexion, criterios),
        depositos_por_dia=consultas.depositos_por_dia(conexion, criterios),
        retiros_por_dia=consultas.retiros_por_dia(conexion, criterios),
        usuarios_activos=consultas.usuarios_activos(conexion, criterios),
        canjes=consultas.canjes_por_estado(conexion, criterios),
        alertas=consultas.alertas_por_estado(conexion, criterios),
    )


def _competiciones(conexion: Conexion, criterios: Criterios | None) -> pd.DataFrame:
    if criterios is None:
        return marco_vacio(COLUMNAS_COMPETICIONES)
    return consultas.competiciones(conexion, criterios)


def obtener_resumen(
    conexion: Conexion, filtros: Filtros, generado_en: datetime
) -> RespuestaResumen:
    datos = datos_resumen(conexion, _criterios(conexion, filtros))
    return construir_resumen(filtros, datos, generado_en)


def obtener_serie(conexion: Conexion, filtros: Filtros) -> RespuestaSerieDiaria:
    criterios = _criterios(conexion, filtros)
    if criterios is None:
        vacios = DatosResumen.vacios()
        return construir_serie(
            filtros, vacios.apuestas_por_dia, vacios.depositos_por_dia, vacios.retiros_por_dia
        )
    return construir_serie(
        filtros,
        consultas.apuestas_por_dia(conexion, criterios),
        consultas.depositos_por_dia(conexion, criterios),
        consultas.retiros_por_dia(conexion, criterios),
    )


def obtener_competiciones(conexion: Conexion, filtros: Filtros) -> RespuestaCompeticiones:
    marco = _competiciones(conexion, _criterios(conexion, filtros))
    return construir_competiciones(filtros, marco)
