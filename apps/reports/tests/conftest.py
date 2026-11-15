import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi.testclient import TestClient

from reports.config import Configuracion
from reports.main import crear_app

from .claves import generar_ed25519, pem_publica

ORIGEN_WEB = "http://localhost:3000"


@pytest.fixture(scope="session")
def clave_privada() -> ed25519.Ed25519PrivateKey:
    """Par Ed25519 de prueba: la API firma con la privada; reportes solo conoce la pública."""
    return generar_ed25519()


@pytest.fixture
def configuracion(clave_privada: ed25519.Ed25519PrivateKey) -> Configuracion:
    # _env_file=None: las pruebas unitarias no dependen del .env de quien las corre.
    return Configuracion(
        _env_file=None,
        reports_database_url="postgresql://reportes_lectura:clave-secreta@localhost:5432/apuestas",
        web_origin=ORIGEN_WEB,
        jwt_public_key=pem_publica(clave_privada),
    )


@pytest.fixture
def cliente(configuracion: Configuracion) -> TestClient:
    return TestClient(crear_app(configuracion))
