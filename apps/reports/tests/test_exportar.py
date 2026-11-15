"""Exportación CSV y PDF (HU7, FR-032; contracts/reportes.md §2)."""

import csv
import io
import re
import zlib
from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pandas as pd
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi.testclient import TestClient

from reports import servicio
from reports.exportar import generar_csv, generar_pdf, neutralizar
from reports.filtros import Filtros
from reports.metricas import (
    COLUMNAS_ALERTAS,
    COLUMNAS_APUESTAS_DIA,
    COLUMNAS_CANJES,
    COLUMNAS_COMPETICIONES,
    COLUMNAS_MOVIMIENTOS_DIA,
    DatosResumen,
    construir_competiciones,
    construir_resumen,
    construir_serie,
)
from reports.modelos import Reporte

from .claves import emitir

D = Decimal
FILTROS = Filtros(desde=date(2026, 12, 1), hasta=date(2026, 12, 3))
GENERADO_EN = datetime(2027, 1, 2, 10, 0, 0, tzinfo=UTC)
PELIGROSOS = ["=", "+", "-", "@", "\t", "\r"]
NUMERO = re.compile(r"-?[0-9]+(\.[0-9]{2})?")


def _marco(columnas: tuple[str, ...], filas: list[tuple[Any, ...]]) -> pd.DataFrame:
    return pd.DataFrame(filas, columns=list(columnas))


def _reporte(filtros: Filtros = FILTROS, nombre_competicion: str = "LigaPro") -> Reporte:
    apuestas = _marco(
        COLUMNAS_APUESTAS_DIA,
        [
            (date(2026, 12, 1), 2, D("30.00"), D("25.50"), D("30.00")),
            (date(2026, 12, 3), 1, D("7.75"), D("15.50"), D("7.75")),
        ],
    )
    depositos = _marco(COLUMNAS_MOVIMIENTOS_DIA, [(date(2026, 12, 2), 1, D("100.00"))])
    retiros = _marco(COLUMNAS_MOVIMIENTOS_DIA, [(date(2026, 12, 3), 1, D("40.00"))])
    datos = DatosResumen(
        apuestas_por_dia=apuestas,
        depositos_por_dia=depositos,
        retiros_por_dia=retiros,
        usuarios_activos=2,
        canjes=_marco(COLUMNAS_CANJES, [("ACEPTADO", 3, D("12.50"))]),
        alertas=_marco(COLUMNAS_ALERTAS, [("ABIERTA", "ALTA", 4)]),
    )
    competiciones = _marco(
        COLUMNAS_COMPETICIONES,
        [("c1", nombre_competicion, "futbol", 2, D("30.00"), D("25.50"), D("30.00"))],
    )
    return Reporte(
        resumen=construir_resumen(filtros, datos, GENERADO_EN),
        serie=construir_serie(filtros, apuestas, depositos, retiros),
        competiciones=construir_competiciones(filtros, competiciones),
    )


def _filas_csv(contenido: bytes) -> list[list[str]]:
    return list(csv.reader(io.StringIO(contenido.decode("utf-8-sig"), newline="")))


def test_csv_empieza_con_bom_para_que_excel_lea_utf8() -> None:
    assert generar_csv(_reporte()).startswith(b"\xef\xbb\xbf")


def test_csv_tiene_filtros_fecha_de_generacion_y_las_secciones() -> None:
    filas = _filas_csv(generar_csv(_reporte()))

    assert ["Generado en (UTC)", "2027-01-02T10:00:00Z"] in filas
    assert ["Desde", "2026-12-01"] in filas
    assert ["Hasta", "2026-12-03"] in filas
    assert ["Deporte", "Todos"] in filas
    primeras = [fila[0] for fila in filas if fila]
    for seccion in ["Resumen", "Serie diaria", "Competiciones"]:
        assert seccion in primeras


def test_csv_lleva_los_mismos_valores_que_el_resumen_y_la_serie() -> None:
    filas = _filas_csv(generar_csv(_reporte()))

    assert ["Apuestas", "3"] in filas
    assert ["Volumen apostado", "37.75"] in filas
    assert ["GGR", "-3.25"] in filas
    assert ["Monto depositado", "100.00"] in filas
    assert ["Bono otorgado", "12.50"] in filas
    assert ["Alertas abiertas", "4"] in filas
    assert [
        "Fecha",
        "Apuestas",
        "Volumen",
        "Premios pagados",
        "GGR",
        "Depósitos",
        "Retiros",
    ] in filas
    assert ["2026-12-03", "1", "7.75", "15.50", "-7.75", "0.00", "40.00"] in filas
    assert ["LigaPro", "futbol", "2", "30.00", "4.50"] in filas


@pytest.mark.parametrize("prefijo", PELIGROSOS)
def test_csv_neutraliza_textos_que_una_hoja_ejecutaria(prefijo: str) -> None:
    peligroso = f'{prefijo}HYPERLINK("http://malo.example","clic")'
    filtros = Filtros(desde=date(2026, 12, 1), hasta=date(2026, 12, 3), deporte=peligroso)

    filas = _filas_csv(generar_csv(_reporte(filtros, nombre_competicion=peligroso)))

    assert ["Deporte", f"'{peligroso}"] in filas
    assert [f"'{peligroso}", "futbol", "2", "30.00", "4.50"] in filas


def test_csv_ninguna_celda_de_texto_queda_sin_neutralizar() -> None:
    filtros = Filtros(desde=date(2026, 12, 1), hasta=date(2026, 12, 3), usuario="-ana@example.com")

    filas = _filas_csv(generar_csv(_reporte(filtros, nombre_competicion="+Liga")))

    for celda in (celda for fila in filas for celda in fila):
        if celda and celda[0] in PELIGROSOS:
            # Solo los importes que genera reportes (p. ej. un GGR negativo) quedan como número.
            assert NUMERO.fullmatch(celda), celda


@pytest.mark.parametrize(
    ("celda", "esperada"),
    [("LigaPro", "LigaPro"), ("", ""), ("a=b", "a=b"), ("=1+1", "'=1+1"), ("@SUMA", "'@SUMA")],
)
def test_neutralizar(celda: str, esperada: str) -> None:
    assert neutralizar(celda) == esperada


def _texto_pdf(contenido: bytes) -> str:
    """Descomprime los flujos del PDF para buscar el texto de las páginas."""
    partes = []
    for flujo in re.findall(rb"stream\r?\n(.*?)\r?\nendstream", contenido, re.DOTALL):
        try:
            partes.append(zlib.decompress(flujo).decode("latin-1"))
        except zlib.error:
            partes.append(flujo.decode("latin-1"))
    return "\n".join(partes)


def test_pdf_tiene_titulo_filtros_fecha_metricas_y_serie() -> None:
    filtros = Filtros(
        desde=date(2026, 12, 1),
        hasta=date(2026, 12, 3),
        deporte="futbol",
        usuario="ana@example.com",
    )

    contenido = generar_pdf(_reporte(filtros))

    assert contenido.startswith(b"%PDF")
    texto = _texto_pdf(contenido)
    for esperado in [
        "Reporte de apuestas deportivas",
        "2026-12-01",
        "2026-12-03",
        "futbol",
        "ana@example.com",
        "2027-01-02T10:00:00Z",
        "37.75",
        "-3.25",
        "12.50",
        "LigaPro",
    ]:
        assert esperado in texto, esperado


def test_pdf_acepta_textos_fuera_de_latin1() -> None:
    filtros = Filtros(desde=date(2026, 12, 1), hasta=date(2026, 12, 3), deporte="fútbol ⚽")

    assert generar_pdf(_reporte(filtros, nombre_competicion="Liga 🏆")).startswith(b"%PDF")


def test_pdf_de_un_rango_largo_ocupa_varias_paginas() -> None:
    filtros = Filtros(desde=date(2026, 1, 1), hasta=date(2026, 12, 31))

    contenido = generar_pdf(_reporte(filtros))

    assert len(re.findall(rb"/Type\s*/Page\b", contenido)) > 1


class _ConexionVacia:
    def __enter__(self) -> "_ConexionVacia":
        return self

    def __exit__(self, *_: object) -> None:
        return None


@pytest.fixture
def cliente_exportar(
    cliente: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    clave_privada: ed25519.Ed25519PrivateKey,
) -> Iterator[TestClient]:
    def reporte_fijo(_conexion: object, filtros: Filtros, _generado_en: datetime) -> Reporte:
        return _reporte(filtros)

    monkeypatch.setattr(servicio, "obtener_reporte", reporte_fijo)
    cliente.app.state.fabrica_conexiones = _ConexionVacia  # type: ignore[attr-defined]
    cliente.headers["Authorization"] = f"Bearer {emitir(clave_privada)}"
    yield cliente


@pytest.mark.parametrize(
    ("formato", "tipo"), [("csv", "text/csv; charset=utf-8"), ("pdf", "application/pdf")]
)
def test_la_descarga_es_un_adjunto_con_nombre_por_rango(
    cliente_exportar: TestClient, formato: str, tipo: str
) -> None:
    respuesta = cliente_exportar.get(
        "/reportes/exportar",
        params={"desde": "2026-12-01", "hasta": "2026-12-03", "formato": formato},
    )

    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == tipo
    assert respuesta.headers["content-disposition"] == (
        f'attachment; filename="reporte-2026-12-01-2026-12-03.{formato}"'
    )
    assert respuesta.headers["cache-control"] == "no-store"
