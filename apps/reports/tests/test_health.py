from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from reports.config import ErrorConfiguracion, cargar_configuracion
from reports.health import EstadoDependencia, SondaBaseDeDatos, comprobar_base_de_datos
from reports.main import crear_app, obtener_sonda_base_de_datos

from .conftest import ORIGEN_WEB


def _con_sonda(cliente: TestClient, estado: EstadoDependencia) -> TestClient:
    def sonda() -> EstadoDependencia:
        return estado

    def proveer() -> SondaBaseDeDatos:
        return sonda

    cliente.app.dependency_overrides[obtener_sonda_base_de_datos] = proveer  # type: ignore[attr-defined]
    return cliente


def test_health_ok_cuando_la_base_de_datos_responde(cliente: TestClient) -> None:
    _con_sonda(cliente, EstadoDependencia(estado="ok", latencia_ms=3))

    respuesta = cliente.get("/health")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["estado"] == "ok"
    assert cuerpo["servicio"] == "reports"
    assert cuerpo["dependencias"] == {"baseDeDatos": {"estado": "ok", "latenciaMs": 3}}
    assert datetime.fromisoformat(cuerpo["fecha"]).tzinfo is not None
    assert cuerpo["version"] == "0.1.0"


def test_health_503_cuando_la_base_de_datos_no_responde(cliente: TestClient) -> None:
    _con_sonda(cliente, EstadoDependencia(estado="error", latencia_ms=2000))

    respuesta = cliente.get("/health")

    assert respuesta.status_code == 503
    assert respuesta.json()["estado"] == "error"


def test_sonda_real_informa_error_sin_exponer_detalles() -> None:
    # Puerto 1: nadie escucha, la conexión se rechaza de inmediato.
    estado = comprobar_base_de_datos("postgresql://reportes_lectura:clave-secreta@127.0.0.1:1/x")

    assert estado.estado == "error"
    assert "clave-secreta" not in estado.model_dump_json()


def test_cors_solo_para_el_origen_de_la_web(cliente: TestClient) -> None:
    _con_sonda(cliente, EstadoDependencia(estado="ok", latencia_ms=1))

    permitido = cliente.get("/health", headers={"Origin": ORIGEN_WEB})
    ajeno = cliente.get("/health", headers={"Origin": "https://sitio-ajeno.example"})

    assert permitido.headers.get("access-control-allow-origin") == ORIGEN_WEB
    assert "access-control-allow-origin" not in ajeno.headers


def test_configuracion_nombra_la_variable_que_falta_sin_mostrar_valores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("REPORTS_DATABASE_URL", raising=False)
    monkeypatch.setenv("WEB_ORIGIN", "no-es-url-clave-secreta")

    with pytest.raises(ErrorConfiguracion) as error:
        cargar_configuracion(env_file=None)

    mensaje = str(error.value)
    assert "REPORTS_DATABASE_URL" in mensaje
    assert "WEB_ORIGIN" in mensaje
    assert "clave-secreta" not in mensaje


@pytest.mark.integracion
def test_health_contra_la_base_de_datos_real() -> None:
    cliente = TestClient(crear_app(cargar_configuracion()))

    respuesta = cliente.get("/health")

    assert respuesta.status_code == 200
    assert respuesta.json()["dependencias"]["baseDeDatos"]["estado"] == "ok"
