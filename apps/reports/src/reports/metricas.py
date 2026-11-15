"""Métricas de los reportes con pandas (FR-031; research.md §9).

El SQL ya agregó por día, estado y competición (a lo sumo cientos de filas); aquí se completan los
días sin datos con ceros, se deriva el GGR y se totaliza. El dinero es `Decimal` de punta a punta:
se suma exacto y se redondea a centavos solo al publicar.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

import pandas as pd

from reports.filtros import Filtros
from reports.modelos import (
    CERO,
    CompeticionDesglose,
    DiaSerie,
    FiltrosAplicados,
    MetricasAlertas,
    MetricasApuestas,
    MetricasCupones,
    MetricasMovimientos,
    RespuestaCompeticiones,
    RespuestaResumen,
    RespuestaSerieDiaria,
)

# monto_liquidado = Σ monto de las apuestas GANADA o PERDIDA (base del GGR).
COLUMNAS_APUESTAS_DIA = ("fecha", "apuestas", "volumen", "premios_pagados", "monto_liquidado")
COLUMNAS_MOVIMIENTOS_DIA = ("fecha", "cantidad", "monto")
COLUMNAS_CANJES = ("estado", "cantidad", "bono")
COLUMNAS_ALERTAS = ("estado", "severidad", "cantidad")
COLUMNAS_COMPETICIONES = (
    "competicion_id",
    "nombre",
    "deporte",
    "apuestas",
    "volumen",
    "premios_pagados",
    "monto_liquidado",
)
MAXIMO_COMPETICIONES = 20


def marco_vacio(columnas: tuple[str, ...]) -> pd.DataFrame:
    return pd.DataFrame(columns=list(columnas))


@dataclass(frozen=True, eq=False)
class DatosResumen:
    """Agregados que devuelve `consultas.py` para el resumen."""

    apuestas_por_dia: pd.DataFrame
    depositos_por_dia: pd.DataFrame
    retiros_por_dia: pd.DataFrame
    usuarios_activos: int
    canjes: pd.DataFrame
    alertas: pd.DataFrame

    @classmethod
    def vacios(cls) -> "DatosResumen":
        return cls(
            apuestas_por_dia=marco_vacio(COLUMNAS_APUESTAS_DIA),
            depositos_por_dia=marco_vacio(COLUMNAS_MOVIMIENTOS_DIA),
            retiros_por_dia=marco_vacio(COLUMNAS_MOVIMIENTOS_DIA),
            usuarios_activos=0,
            canjes=marco_vacio(COLUMNAS_CANJES),
            alertas=marco_vacio(COLUMNAS_ALERTAS),
        )


def _decimal(valor: object) -> Decimal:
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return CERO
    if isinstance(valor, Decimal):
        return valor
    return Decimal(str(valor))


def _suma(valores: Iterable[object]) -> Decimal:
    return sum((_decimal(valor) for valor in valores), CERO)


def _entero(valor: object) -> int:
    return int(str(valor))


def _ggr(marco: pd.DataFrame) -> "pd.Series[Any]":
    """GGR = Σ monto de apuestas ganadas o perdidas, menos los premios pagados (FR-031)."""
    diferencias = [
        _decimal(liquidado) - _decimal(premios)
        for liquidado, premios in zip(
            marco["monto_liquidado"].tolist(), marco["premios_pagados"].tolist(), strict=True
        )
    ]
    return pd.Series(diferencias, index=marco.index, dtype=object)


def _por_dia(
    marco: pd.DataFrame, dias: pd.DatetimeIndex, enteros: list[str], montos: list[str]
) -> pd.DataFrame:
    completo = marco.assign(fecha=pd.to_datetime(marco["fecha"])).set_index("fecha").reindex(dias)
    for columna in enteros:
        completo[columna] = completo[columna].fillna(0).astype("int64")
    for columna in montos:
        completo[columna] = completo[columna].map(_decimal).astype(object)
    return completo


def serie_diaria(
    filtros: Filtros, apuestas: pd.DataFrame, depositos: pd.DataFrame, retiros: pd.DataFrame
) -> pd.DataFrame:
    """Una fila por día del rango (índice `fecha`), con ceros donde no hay datos."""
    dias = pd.date_range(filtros.desde, filtros.hasta, freq="D", name="fecha")
    montos_apuestas = ["volumen", "premios_pagados", "monto_liquidado"]
    serie = pd.concat(
        [
            _por_dia(apuestas, dias, ["apuestas"], montos_apuestas),
            _por_dia(depositos, dias, ["cantidad"], ["monto"]).add_prefix("depositos_"),
            _por_dia(retiros, dias, ["cantidad"], ["monto"]).add_prefix("retiros_"),
        ],
        axis=1,
    )
    serie["ggr"] = _ggr(serie)
    return serie


def _dias(serie: pd.DataFrame) -> list[DiaSerie]:
    return [
        DiaSerie(
            fecha=fecha.date(),
            volumen=fila["volumen"],
            premios_pagados=fila["premios_pagados"],
            ggr=fila["ggr"],
            apuestas=_entero(fila["apuestas"]),
            depositos=fila["depositos_monto"],
            retiros=fila["retiros_monto"],
        )
        for fecha, fila in serie.iterrows()
        if isinstance(fecha, pd.Timestamp)
    ]


def construir_serie(
    filtros: Filtros, apuestas: pd.DataFrame, depositos: pd.DataFrame, retiros: pd.DataFrame
) -> RespuestaSerieDiaria:
    serie = serie_diaria(filtros, apuestas, depositos, retiros)
    return RespuestaSerieDiaria(filtros=FiltrosAplicados.de(filtros), dias=_dias(serie))


def _metricas_apuestas(serie: pd.DataFrame, usuarios_activos: int) -> MetricasApuestas:
    return MetricasApuestas(
        cantidad=int(serie["apuestas"].sum()),
        volumen=_suma(serie["volumen"]),
        premios_pagados=_suma(serie["premios_pagados"]),
        ggr=_suma(serie["ggr"]),
        usuarios_activos=usuarios_activos,
    )


def _movimientos(serie: pd.DataFrame, prefijo: str) -> MetricasMovimientos:
    return MetricasMovimientos(
        cantidad=int(serie[f"{prefijo}_cantidad"].sum()), monto=_suma(serie[f"{prefijo}_monto"])
    )


def _contar(marco: pd.DataFrame, columna: str, valor: str) -> int:
    return sum(_entero(c) for c in marco.loc[marco[columna] == valor, "cantidad"].tolist())


def _cupones(canjes: pd.DataFrame) -> MetricasCupones:
    return MetricasCupones(
        canjes_aceptados=_contar(canjes, "estado", "ACEPTADO"),
        canjes_rechazados=_contar(canjes, "estado", "RECHAZADO"),
        bono_otorgado=_suma(canjes["bono"]),
    )


def _alertas(alertas: pd.DataFrame) -> MetricasAlertas:
    return MetricasAlertas(
        abiertas=_contar(alertas, "estado", "ABIERTA"),
        confirmadas=_contar(alertas, "estado", "CONFIRMADA"),
        descartadas=_contar(alertas, "estado", "DESCARTADA"),
        altas=_contar(alertas, "severidad", "ALTA"),
        medias=_contar(alertas, "severidad", "MEDIA"),
    )


def construir_resumen(
    filtros: Filtros, datos: DatosResumen, generado_en: datetime
) -> RespuestaResumen:
    serie = serie_diaria(
        filtros, datos.apuestas_por_dia, datos.depositos_por_dia, datos.retiros_por_dia
    )
    return RespuestaResumen(
        filtros=FiltrosAplicados.de(filtros),
        apuestas=_metricas_apuestas(serie, datos.usuarios_activos),
        depositos=_movimientos(serie, "depositos"),
        retiros=_movimientos(serie, "retiros"),
        cupones=_cupones(datos.canjes),
        alertas=_alertas(datos.alertas),
        generado_en=generado_en,
    )


def construir_competiciones(filtros: Filtros, marco: pd.DataFrame) -> RespuestaCompeticiones:
    """Desglose por competición: GGR derivado, por volumen descendente y como máximo 20."""
    desglose = marco.assign(volumen=marco["volumen"].map(_decimal), ggr=_ggr(marco))
    ordenado = desglose.sort_values(["volumen", "nombre"], ascending=[False, True], kind="stable")
    competiciones = [
        CompeticionDesglose(
            competicion_id=str(fila["competicion_id"]),
            nombre=str(fila["nombre"]),
            deporte=str(fila["deporte"]),
            apuestas=_entero(fila["apuestas"]),
            volumen=fila["volumen"],
            ggr=fila["ggr"],
        )
        for _, fila in ordenado.head(MAXIMO_COMPETICIONES).iterrows()
    ]
    return RespuestaCompeticiones(filtros=FiltrosAplicados.de(filtros), competiciones=competiciones)
