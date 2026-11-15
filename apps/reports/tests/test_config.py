"""Variables JWT_* de reportes (Spec 4, contracts/configuracion.md y contrato 6)."""

import pytest

from reports.config import ErrorConfiguracion, cargar_configuracion

from .claves import generar_ed25519, generar_rsa, pem_publica

VARIABLES_JWT = ("JWT_PUBLIC_KEY", "JWT_ALGORITHM", "JWT_ISSUER", "JWT_AUDIENCE")


@pytest.fixture
def entorno(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """Entorno mínimo válido del Spec 1, sin variables JWT de quien corre las pruebas."""
    monkeypatch.setenv("REPORTS_DATABASE_URL", "postgresql://reportes_lectura:x@localhost:5432/a")
    monkeypatch.setenv("WEB_ORIGIN", "http://localhost:3000")
    for variable in VARIABLES_JWT:
        monkeypatch.delenv(variable, raising=False)
    return monkeypatch


def _error_de_configuracion() -> str:
    with pytest.raises(ErrorConfiguracion) as error:
        cargar_configuracion(env_file=None)
    return str(error.value)


def test_valores_por_defecto_con_solo_la_clave_publica(entorno: pytest.MonkeyPatch) -> None:
    pem = pem_publica(generar_ed25519())
    entorno.setenv("JWT_PUBLIC_KEY", pem)

    config = cargar_configuracion(env_file=None)

    assert config.jwt_public_key == pem.strip()
    assert config.jwt_algorithm == "EdDSA"
    assert config.jwt_issuer == "apuestas-api"
    assert config.jwt_audience == "apuestas"


def test_la_clave_publica_es_obligatoria(entorno: pytest.MonkeyPatch) -> None:
    assert "JWT_PUBLIC_KEY" in _error_de_configuracion()


def test_acepta_la_clave_con_saltos_de_linea_escapados(entorno: pytest.MonkeyPatch) -> None:
    pem = pem_publica(generar_ed25519())
    entorno.setenv("JWT_PUBLIC_KEY", pem.strip().replace("\n", "\\n"))

    config = cargar_configuracion(env_file=None)

    assert config.jwt_public_key == pem.strip()


@pytest.mark.parametrize("algoritmo", ["HS256", "none", "RS512", "ES256", "eddsa"])
def test_rechaza_algoritmos_fuera_de_la_lista(entorno: pytest.MonkeyPatch, algoritmo: str) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", pem_publica(generar_ed25519()))
    entorno.setenv("JWT_ALGORITHM", algoritmo)

    assert "JWT_ALGORITHM" in _error_de_configuracion()


def test_rechaza_un_texto_que_no_es_una_clave_pem(entorno: pytest.MonkeyPatch) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", "no-es-una-clave-secreta")

    mensaje = _error_de_configuracion()

    assert "JWT_PUBLIC_KEY" in mensaje
    assert "no-es-una-clave-secreta" not in mensaje


def test_rechaza_una_clave_rsa_con_eddsa(entorno: pytest.MonkeyPatch) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", pem_publica(generar_rsa()))

    assert "JWT_PUBLIC_KEY" in _error_de_configuracion()


def test_rechaza_una_clave_ed25519_con_rs256(entorno: pytest.MonkeyPatch) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", pem_publica(generar_ed25519()))
    entorno.setenv("JWT_ALGORITHM", "RS256")

    assert "JWT_PUBLIC_KEY" in _error_de_configuracion()


def test_rechaza_rsa_de_menos_de_2048_bits(entorno: pytest.MonkeyPatch) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", pem_publica(generar_rsa(1024)))
    entorno.setenv("JWT_ALGORITHM", "RS256")

    assert "JWT_PUBLIC_KEY" in _error_de_configuracion()


def test_acepta_rs256_con_clave_rsa(entorno: pytest.MonkeyPatch) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", pem_publica(generar_rsa()))
    entorno.setenv("JWT_ALGORITHM", "RS256")

    assert cargar_configuracion(env_file=None).jwt_algorithm == "RS256"


def test_emisor_y_audiencia_configurables(entorno: pytest.MonkeyPatch) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", pem_publica(generar_ed25519()))
    entorno.setenv("JWT_ISSUER", "otra-api")
    entorno.setenv("JWT_AUDIENCE", "otra-audiencia")

    config = cargar_configuracion(env_file=None)

    assert (config.jwt_issuer, config.jwt_audience) == ("otra-api", "otra-audiencia")


@pytest.mark.parametrize("variable", ["JWT_ISSUER", "JWT_AUDIENCE"])
def test_emisor_y_audiencia_no_pueden_estar_vacios(
    entorno: pytest.MonkeyPatch, variable: str
) -> None:
    entorno.setenv("JWT_PUBLIC_KEY", pem_publica(generar_ed25519()))
    entorno.setenv(variable, "")

    assert variable in _error_de_configuracion()
