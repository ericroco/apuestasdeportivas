"""Rutas /reportes sin base real: autenticación antes que filtros y que la base, y errores 503."""

from collections.abc import Callable
from typing import Any

import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi.testclient import TestClient

from .claves import emitir

RANGO = "desde=2026-12-01&hasta=2026-12-31"
RUTAS = [
    f"/reportes/resumen?{RANGO}",
    f"/reportes/serie-diaria?{RANGO}",
    f"/reportes/competiciones?{RANGO}",
    f"/reportes/exportar?{RANGO}&formato=csv",
]


class ConexionQueFalla:
    """Doble de psycopg.Connection: cada consulta lanza el error indicado."""

    def __init__(self, error: Exception) -> None:
        self._error = error

    def __enter__(self) -> "ConexionQueFalla":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, *_: object, **__: object) -> Any:
        raise self._error


class Fabrica:
    """Cuenta cuántas conexiones se abren."""

    def __init__(self, crear: Callable[[], Any]) -> None:
        self._crear = crear
        self.llamadas = 0

    def __call__(self) -> Any:
        self.llamadas += 1
        return self._crear()


@pytest.fixture
def fabrica(cliente: TestClient) -> Fabrica:
    nueva = Fabrica(lambda: ConexionQueFalla(AssertionError("no debía consultar")))
    cliente.app.state.fabrica_conexiones = nueva  # type: ignore[attr-defined]
    return nueva


def _admin(clave: ed25519.Ed25519PrivateKey) -> dict[str, str]:
    return {"Authorization": f"Bearer {emitir(clave)}"}


@pytest.mark.parametrize("ruta", RUTAS)
def test_sin_token_responde_401_sin_abrir_la_base(
    cliente: TestClient, fabrica: Fabrica, ruta: str
) -> None:
    respuesta = cliente.get(ruta)

    assert respuesta.status_code == 401
    assert respuesta.headers["www-authenticate"] == "Bearer"
    assert fabrica.llamadas == 0


@pytest.mark.parametrize("ruta", RUTAS)
def test_sin_rol_de_administrador_responde_403_sin_abrir_la_base(
    cliente: TestClient, fabrica: Fabrica, clave_privada: ed25519.Ed25519PrivateKey, ruta: str
) -> None:
    token = emitir(clave_privada, roles=["OPERADOR"])

    respuesta = cliente.get(ruta, headers={"Authorization": f"Bearer {token}"})

    assert respuesta.status_code == 403
    assert respuesta.json()["detail"]["codigo"] == "SIN_PERMISO"
    assert fabrica.llamadas == 0


def test_la_autenticacion_va_antes_que_los_filtros(cliente: TestClient, fabrica: Fabrica) -> None:
    respuesta = cliente.get("/reportes/resumen?desde=no-es-fecha")

    assert respuesta.status_code == 401


@pytest.mark.parametrize(
    "ruta",
    [
        "/reportes/resumen",
        "/reportes/serie-diaria?desde=2026-12-02&hasta=2026-12-01",
        "/reportes/competiciones?desde=2026-01-01&hasta=2027-12-31",
        f"/reportes/resumen?{RANGO}&competicionId=1%20OR%201%3D1",
        f"/reportes/exportar?{RANGO}",
        f"/reportes/exportar?{RANGO}&formato=xlsx",
    ],
)
def test_filtros_invalidos_responden_400_sin_abrir_la_base(
    cliente: TestClient, fabrica: Fabrica, clave_privada: ed25519.Ed25519PrivateKey, ruta: str
) -> None:
    respuesta = cliente.get(ruta, headers=_admin(clave_privada))

    assert respuesta.status_code == 400
    assert respuesta.json()["detail"]["codigo"] == "FILTROS_INVALIDOS"
    assert fabrica.llamadas == 0


@pytest.mark.parametrize(
    "error",
    [
        psycopg.errors.UndefinedTable("no existe la relación"),
        psycopg.errors.UndefinedColumn("no existe la columna"),
        psycopg.errors.QueryCanceled("tiempo agotado"),
    ],
    ids=["tabla", "columna", "tiempo"],
)
@pytest.mark.parametrize("ruta", RUTAS)
def test_datos_no_disponibles_responden_503(
    cliente: TestClient,
    clave_privada: ed25519.Ed25519PrivateKey,
    ruta: str,
    error: Exception,
) -> None:
    cliente.app.state.fabrica_conexiones = lambda: ConexionQueFalla(error)  # type: ignore[attr-defined]

    respuesta = cliente.get(ruta, headers=_admin(clave_privada))

    assert respuesta.status_code == 503
    detalle = respuesta.json()["detail"]
    assert detalle["codigo"] == "DATOS_NO_DISPONIBLES"
    assert "relación" not in detalle["mensaje"]


def test_base_de_datos_caida_responde_503(
    cliente: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    def sin_base() -> Any:
        raise psycopg.OperationalError("connection refused: clave-secreta")

    cliente.app.state.fabrica_conexiones = sin_base  # type: ignore[attr-defined]

    respuesta = cliente.get(f"/reportes/resumen?{RANGO}", headers=_admin(clave_privada))

    assert respuesta.status_code == 503
    assert respuesta.json()["detail"]["codigo"] == "DATOS_NO_DISPONIBLES"
    assert "clave-secreta" not in respuesta.text


@pytest.mark.parametrize("metodo", ["POST", "PUT", "PATCH", "DELETE"])
@pytest.mark.parametrize("ruta", RUTAS)
def test_las_rutas_de_reportes_solo_aceptan_get(
    cliente: TestClient, clave_privada: ed25519.Ed25519PrivateKey, metodo: str, ruta: str
) -> None:
    respuesta = cliente.request(metodo, ruta, headers=_admin(clave_privada))

    assert respuesta.status_code == 405


def test_ninguna_ruta_de_la_app_escribe(cliente: TestClient) -> None:
    metodos = {
        metodo
        for ruta in cliente.app.routes  # type: ignore[attr-defined]
        for metodo in getattr(ruta, "methods", set())
    }

    assert metodos <= {"GET", "HEAD"}
