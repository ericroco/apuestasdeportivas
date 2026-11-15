"""Filtros de los reportes (FR-028, FR-029; contracts/reportes.md §2)."""

from datetime import UTC, date, datetime
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from reports.filtros import ErrorFiltros, Filtros, leer_filtros, validar_filtros

UUID = "0b6f7c1e-2d3a-4b5c-9d8e-7f6a5b4c3d2e"


def _validar(**parametros: str | None) -> Filtros:
    valores: dict[str, str | None] = {"desde": "2026-12-01", "hasta": "2026-12-31"}
    valores.update(parametros)
    return validar_filtros(
        desde=valores.get("desde"),
        hasta=valores.get("hasta"),
        deporte=valores.get("deporte"),
        competicion_id=valores.get("competicion_id"),
        usuario=valores.get("usuario"),
    )


def _mensaje_de_error(**parametros: str | None) -> str:
    with pytest.raises(ErrorFiltros) as error:
        _validar(**parametros)
    return str(error.value)


def test_rango_valido_sin_filtros_opcionales() -> None:
    filtros = _validar()

    assert filtros == Filtros(desde=date(2026, 12, 1), hasta=date(2026, 12, 31))
    assert filtros.inicio == datetime(2026, 12, 1, tzinfo=UTC)
    # `hasta` incluido: el fin exclusivo es el día siguiente a medianoche UTC.
    assert filtros.fin == datetime(2027, 1, 1, tzinfo=UTC)
    assert filtros.cantidad_dias == 31


@pytest.mark.parametrize("faltante", ["desde", "hasta"])
def test_el_rango_es_obligatorio(faltante: str) -> None:
    assert faltante in _mensaje_de_error(**{faltante: None})


@pytest.mark.parametrize(
    "valor", ["2026-13-01", "2026-02-30", "01/12/2026", "20261201", "2026-W48-1", "2026-12-1", ""]
)
def test_las_fechas_deben_tener_el_formato_aaaa_mm_dd(valor: str) -> None:
    mensaje = _mensaje_de_error(desde=valor)

    assert "desde" in mensaje
    assert "AAAA-MM-DD" in mensaje


def test_hasta_no_puede_ser_anterior_a_desde() -> None:
    mensaje = _mensaje_de_error(desde="2026-12-02", hasta="2026-12-01")

    assert "hasta" in mensaje


def test_un_solo_dia_es_un_rango_valido() -> None:
    assert _validar(desde="2026-12-01", hasta="2026-12-01").cantidad_dias == 1


def test_acepta_hasta_366_dias() -> None:
    assert _validar(desde="2024-01-01", hasta="2024-12-31").cantidad_dias == 366


def test_rechaza_mas_de_366_dias() -> None:
    assert "366" in _mensaje_de_error(desde="2026-01-01", hasta="2027-01-02")


def test_usuario_por_uuid_se_normaliza() -> None:
    filtros = _validar(usuario=UUID.upper())

    assert filtros.usuario == UUID
    assert filtros.usuario_id == UUID
    assert filtros.correo is None


def test_usuario_por_correo() -> None:
    filtros = _validar(usuario="  ana@example.com ")

    assert filtros.usuario == "ana@example.com"
    assert filtros.correo == "ana@example.com"
    assert filtros.usuario_id is None


@pytest.mark.parametrize("valor", ["ana", "ana@", "@example.com", "a b@example.com", "a@b@c"])
def test_usuario_debe_ser_uuid_o_correo(valor: str) -> None:
    assert "usuario" in _mensaje_de_error(usuario=valor)


def test_rechaza_un_correo_demasiado_largo() -> None:
    assert "usuario" in _mensaje_de_error(usuario=f"{'a' * 250}@example.com")


def test_competicion_debe_ser_uuid() -> None:
    assert _validar(competicion_id=UUID.upper()).competicion_id == UUID
    assert "competicionId" in _mensaje_de_error(competicion_id="1 OR 1=1")


def test_deporte_se_recorta_y_vacio_equivale_a_sin_filtro() -> None:
    assert _validar(deporte="  futbol ").deporte == "futbol"
    assert _validar(deporte="   ").deporte is None
    assert "deporte" in _mensaje_de_error(deporte="x" * 51)


def test_los_filtros_vacios_equivalen_a_sin_filtro() -> None:
    filtros = _validar(competicion_id="", usuario="")

    assert (filtros.competicion_id, filtros.usuario) == (None, None)


@pytest.fixture
def cliente_filtros() -> TestClient:
    app = FastAPI()

    @app.get("/filtros")
    def ver(filtros: Annotated[Filtros, Depends(leer_filtros)]) -> dict[str, str | None]:
        return {"desde": filtros.desde.isoformat(), "competicion": filtros.competicion_id}

    return TestClient(app)


def test_la_dependencia_lee_los_parametros_de_la_url(cliente_filtros: TestClient) -> None:
    respuesta = cliente_filtros.get(
        "/filtros", params={"desde": "2026-12-01", "hasta": "2026-12-31", "competicionId": UUID}
    )

    assert respuesta.status_code == 200
    assert respuesta.json() == {"desde": "2026-12-01", "competicion": UUID}


def test_la_dependencia_responde_400_filtros_invalidos(cliente_filtros: TestClient) -> None:
    respuesta = cliente_filtros.get("/filtros", params={"desde": "2026-12-01"})

    assert respuesta.status_code == 400
    detalle = respuesta.json()["detail"]
    assert detalle["codigo"] == "FILTROS_INVALIDOS"
    assert "hasta" in detalle["mensaje"]
