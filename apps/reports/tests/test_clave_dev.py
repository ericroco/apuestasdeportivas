"""Herramienta de desarrollo: par Ed25519 en memoria y token de administrador (T057)."""

from datetime import UTC, datetime
from pathlib import Path

import jwt
import pytest

from reports.config import Configuracion
from reports.herramientas.clave_dev import main
from reports.seguridad import VerificadorToken


def _ejecutar(capsys: pytest.CaptureFixture[str], *argumentos: str) -> tuple[str, str, str]:
    main(list(argumentos))
    salida = capsys.readouterr().out
    lineas = [linea for linea in salida.splitlines() if linea and not linea.startswith("#")]
    clave = next(linea for linea in lineas if linea.startswith("JWT_PUBLIC_KEY="))
    token = next(linea for linea in lineas if not linea.startswith("JWT_PUBLIC_KEY="))
    return salida, clave.removeprefix("JWT_PUBLIC_KEY="), token


def _verificador(clave: str) -> VerificadorToken:
    config = Configuracion(
        _env_file=None,
        reports_database_url="postgresql://reportes_lectura:x@localhost:5432/apuestas",
        web_origin="http://localhost:3000",
        jwt_public_key=clave,
    )
    return VerificadorToken.desde_configuracion(config)


def test_imprime_una_clave_publica_para_env_y_un_token_que_reportes_acepta(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("JWT_ISSUER", raising=False)
    monkeypatch.delenv("JWT_AUDIENCE", raising=False)

    salida, clave, token = _ejecutar(capsys)

    assert "\n" not in clave and "\\n" in clave
    sesion = _verificador(clave).verificar(token)
    assert sesion.roles == ("ADMINISTRADOR",)
    assert "PRIVATE KEY" not in salida


def test_el_token_vence_en_15_minutos(capsys: pytest.CaptureFixture[str]) -> None:
    _, _, token = _ejecutar(capsys)

    claims = jwt.decode(token, options={"verify_signature": False})
    assert claims["exp"] - claims["iat"] == 15 * 60
    assert claims["exp"] > datetime.now(UTC).timestamp()


def test_cada_ejecucion_genera_un_par_nuevo(capsys: pytest.CaptureFixture[str]) -> None:
    _, primera, _ = _ejecutar(capsys)
    _, segunda, _ = _ejecutar(capsys)

    assert primera != segunda


def test_puede_emitir_un_token_sin_rol_de_administrador(
    capsys: pytest.CaptureFixture[str],
) -> None:
    _, clave, token = _ejecutar(capsys, "--roles", "OPERADOR", "APOSTADOR")

    assert _verificador(clave).verificar(token).roles == ("OPERADOR", "APOSTADOR")


def test_usa_el_emisor_y_la_audiencia_del_entorno(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("JWT_ISSUER", "otra-api")
    monkeypatch.setenv("JWT_AUDIENCE", "otra-audiencia")

    _, _, token = _ejecutar(capsys)

    claims = jwt.decode(token, options={"verify_signature": False})
    assert (claims["iss"], claims["aud"]) == ("otra-api", "otra-audiencia")


def test_no_escribe_archivos(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)

    _ejecutar(capsys)

    assert list(tmp_path.iterdir()) == []


def test_rechaza_roles_desconocidos(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        main(["--roles", "SUPERUSUARIO"])
