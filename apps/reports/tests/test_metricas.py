"""Métricas derivadas con pandas (FR-031; contracts/reportes.md §2; research.md §9)."""

from collections.abc import Sequence
from datetime import UTC, date, datetime
from decimal import Decimal

import pandas as pd

from reports.filtros import Filtros
from reports.metricas import (
    COLUMNAS_ALERTAS,
    COLUMNAS_APUESTAS_DIA,
    COLUMNAS_CANJES,
    COLUMNAS_COMPETICIONES,
    COLUMNAS_MOVIMIENTOS_DIA,
    MAXIMO_COMPETICIONES,
    DatosResumen,
    construir_competiciones,
    construir_resumen,
    construir_serie,
)

D = Decimal
FILTROS = Filtros(desde=date(2026, 12, 1), hasta=date(2026, 12, 3))
GENERADO_EN = datetime(2027, 1, 2, 10, 0, 0, 123456, tzinfo=UTC)


def _marco(columnas: tuple[str, ...], filas: Sequence[tuple[object, ...]]) -> pd.DataFrame:
    return pd.DataFrame(filas, columns=list(columnas))


def _apuestas(*filas: tuple[object, ...]) -> pd.DataFrame:
    return _marco(COLUMNAS_APUESTAS_DIA, list(filas))


def _movimientos(*filas: tuple[object, ...]) -> pd.DataFrame:
    return _marco(COLUMNAS_MOVIMIENTOS_DIA, list(filas))


APUESTAS = _apuestas(
    # fecha, apuestas, volumen, premios_pagados, monto_liquidado (ganadas + perdidas)
    (date(2026, 12, 1), 2, D("30.00"), D("25.50"), D("30.00")),
    (date(2026, 12, 3), 1, D("7.75"), D("15.50"), D("7.75")),
)
DEPOSITOS = _movimientos((date(2026, 12, 2), 1, D("100.00")), (date(2026, 12, 3), 2, D("50.50")))
RETIROS = _movimientos((date(2026, 12, 3), 1, D("40.00")))


def _datos(**cambios: object) -> DatosResumen:
    base: dict[str, object] = {
        "apuestas_por_dia": APUESTAS,
        "depositos_por_dia": DEPOSITOS,
        "retiros_por_dia": RETIROS,
        "usuarios_activos": 3,
        # Un canje rechazado no tiene bono: coalesce(sum(...), 0) puede llegar como entero.
        "canjes": _marco(COLUMNAS_CANJES, [("ACEPTADO", 3, D("12.50")), ("RECHAZADO", 2, 0)]),
        "alertas": _marco(
            COLUMNAS_ALERTAS,
            [("ABIERTA", "ALTA", 1), ("ABIERTA", "MEDIA", 1), ("CONFIRMADA", "MEDIA", 1)],
        ),
    }
    base.update(cambios)
    return DatosResumen(**base)  # type: ignore[arg-type]


def test_la_serie_tiene_un_dia_por_fecha_con_ceros_donde_no_hay_datos() -> None:
    serie = construir_serie(FILTROS, APUESTAS, DEPOSITOS, _movimientos())

    dias = serie.model_dump(by_alias=True, mode="json")["dias"]
    assert [dia["fecha"] for dia in dias] == ["2026-12-01", "2026-12-02", "2026-12-03"]
    assert dias[1] == {
        "fecha": "2026-12-02",
        "volumen": "0.00",
        "premiosPagados": "0.00",
        "ggr": "0.00",
        "apuestas": 0,
        "depositos": "100.00",
        "retiros": "0.00",
    }


def test_el_ggr_diario_es_lo_liquidado_menos_los_premios() -> None:
    dias = construir_serie(FILTROS, APUESTAS, DEPOSITOS, RETIROS).dias

    assert [dia.ggr for dia in dias] == [D("4.50"), D("0.00"), D("-7.75")]


def test_las_apuestas_pendientes_suman_volumen_pero_no_ggr() -> None:
    apuestas = _apuestas((date(2026, 12, 2), 1, D("5.25"), D("0"), D("0")))

    dia = construir_serie(FILTROS, apuestas, _movimientos(), _movimientos()).dias[1]

    assert (dia.volumen, dia.ggr) == (D("5.25"), D("0.00"))


def test_el_resumen_totaliza_la_serie() -> None:
    resumen = construir_resumen(FILTROS, _datos(), GENERADO_EN)

    cuerpo = resumen.model_dump(by_alias=True, mode="json")
    assert cuerpo["apuestas"] == {
        "cantidad": 3,
        "volumen": "37.75",
        "premiosPagados": "41.00",
        "ggr": "-3.25",
        "usuariosActivos": 3,
    }
    assert cuerpo["depositos"] == {"cantidad": 3, "monto": "150.50"}
    assert cuerpo["retiros"] == {"cantidad": 1, "monto": "40.00"}


def test_cupones_y_alertas_se_derivan_de_los_conteos_por_estado() -> None:
    cuerpo = construir_resumen(FILTROS, _datos(), GENERADO_EN).model_dump(
        by_alias=True, mode="json"
    )

    assert cuerpo["cupones"] == {
        "canjesAceptados": 3,
        "canjesRechazados": 2,
        "bonoOtorgado": "12.50",
    }
    assert cuerpo["alertas"] == {
        "abiertas": 2,
        "confirmadas": 1,
        "descartadas": 0,
        "altas": 1,
        "medias": 2,
    }


def test_el_resumen_lleva_los_filtros_y_la_fecha_de_generacion_en_utc() -> None:
    filtros = Filtros(
        desde=date(2026, 12, 1),
        hasta=date(2026, 12, 3),
        deporte="futbol",
        competicion_id="0b6f7c1e-2d3a-4b5c-9d8e-7f6a5b4c3d2e",
        usuario="ana@example.com",
    )

    cuerpo = construir_resumen(filtros, _datos(), GENERADO_EN).model_dump(
        by_alias=True, mode="json"
    )

    assert cuerpo["filtros"] == {
        "desde": "2026-12-01",
        "hasta": "2026-12-03",
        "deporte": "futbol",
        "competicionId": "0b6f7c1e-2d3a-4b5c-9d8e-7f6a5b4c3d2e",
        "usuario": "ana@example.com",
    }
    assert cuerpo["generadoEn"] == "2027-01-02T10:00:00Z"


def test_un_rango_sin_datos_da_ceros_y_no_un_error() -> None:
    resumen = construir_resumen(FILTROS, DatosResumen.vacios(), GENERADO_EN)

    cuerpo = resumen.model_dump(by_alias=True, mode="json")
    assert cuerpo["apuestas"] == {
        "cantidad": 0,
        "volumen": "0.00",
        "premiosPagados": "0.00",
        "ggr": "0.00",
        "usuariosActivos": 0,
    }
    assert cuerpo["cupones"]["bonoOtorgado"] == "0.00"
    assert cuerpo["alertas"] == dict.fromkeys(
        ["abiertas", "confirmadas", "descartadas", "altas", "medias"], 0
    )


def test_los_montos_se_suman_exactos_y_se_redondean_a_centavos_al_final() -> None:
    apuestas = _apuestas(
        (date(2026, 12, 1), 1, D("0.004"), D("0"), D("0")),
        (date(2026, 12, 2), 1, D("0.004"), D("0"), D("0")),
        (date(2026, 12, 3), 1, D("10.005"), D("0"), D("0")),
    )

    resumen = construir_resumen(FILTROS, _datos(apuestas_por_dia=apuestas), GENERADO_EN)

    # 0.004 + 0.004 + 10.005 = 10.013 → 10.01; un día suelto de 10.005 → 10.01 (mitad hacia arriba).
    assert resumen.apuestas.volumen == D("10.01")
    dias = construir_serie(FILTROS, apuestas, _movimientos(), _movimientos()).dias
    assert [str(dia.volumen) for dia in dias] == ["0.00", "0.00", "10.01"]


def test_el_redondeo_no_produce_cero_negativo() -> None:
    apuestas = _apuestas((date(2026, 12, 1), 1, D("0"), D("0.001"), D("0")))

    dia = construir_serie(FILTROS, apuestas, _movimientos(), _movimientos()).dias[0]

    assert dia.model_dump(by_alias=True, mode="json")["ggr"] == "0.00"


def test_el_desglose_deriva_el_ggr_y_se_limita_a_20_competiciones() -> None:
    filas = [
        (f"id-{i:02d}", f"Liga {i:02d}", "futbol", i, D(100 - i), D("1.50"), D(100 - i))
        for i in range(25)
    ]

    desglose = construir_competiciones(FILTROS, _marco(COLUMNAS_COMPETICIONES, filas))

    assert len(desglose.competiciones) == MAXIMO_COMPETICIONES == 20
    primera = desglose.model_dump(by_alias=True, mode="json")["competiciones"][0]
    assert primera == {
        "competicionId": "id-00",
        "nombre": "Liga 00",
        "deporte": "futbol",
        "apuestas": 0,
        "volumen": "100.00",
        "ggr": "98.50",
    }


def test_el_desglose_ordena_por_volumen_descendente() -> None:
    filas = [
        ("a", "LigaPro", "futbol", 2, D("30.00"), D("25.50"), D("30.00")),
        ("b", "Serie A", "futbol", 2, D("32.00"), D("0"), D("32.00")),
    ]

    desglose = construir_competiciones(FILTROS, _marco(COLUMNAS_COMPETICIONES, filas))

    assert [c.nombre for c in desglose.competiciones] == ["Serie A", "LigaPro"]
