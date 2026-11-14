import pytest
from fastapi.testclient import TestClient

from reports.config import Configuracion
from reports.main import crear_app

ORIGEN_WEB = "http://localhost:3000"


@pytest.fixture
def configuracion() -> Configuracion:
    # _env_file=None: las pruebas unitarias no dependen del .env de quien las corre.
    return Configuracion(
        _env_file=None,
        reports_database_url="postgresql://reportes_lectura:clave-secreta@localhost:5432/apuestas",
        web_origin=ORIGEN_WEB,
    )


@pytest.fixture
def cliente(configuracion: Configuracion) -> TestClient:
    return TestClient(crear_app(configuracion))
