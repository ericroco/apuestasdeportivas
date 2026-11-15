"""Validación del token de administrador (FR-026, SC-008; contrato 6 y contracts/reportes.md §1)."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from reports.config import Configuracion
from reports.seguridad import Administrador, VerificadorToken, requerir_administrador

from .claves import (
    USUARIO_ID,
    emitir,
    emitir_con,
    forjar_hs256,
    forjar_sin_firma,
    generar_ed25519,
    generar_rsa,
    pem_publica,
)


def _app_protegida(configuracion: Configuracion) -> TestClient:
    app = FastAPI()
    app.state.verificador = VerificadorToken.desde_configuracion(configuracion)

    @app.get("/protegida")
    def protegida(
        admin: Annotated[Administrador, Depends(requerir_administrador)],
    ) -> dict[str, str | None]:
        return {"id": admin.id, "email": admin.email}

    return TestClient(app)


@pytest.fixture
def protegido(configuracion: Configuracion) -> TestClient:
    return _app_protegida(configuracion)


def _con_bearer(cliente: TestClient, token: str) -> int:
    return cliente.get("/protegida", headers={"Authorization": f"Bearer {token}"}).status_code


def _afirmar_401(cliente: TestClient, token: str) -> None:
    respuesta = cliente.get("/protegida", headers={"Authorization": f"Bearer {token}"})

    assert respuesta.status_code == 401
    assert respuesta.headers["www-authenticate"] == "Bearer"
    assert respuesta.json()["detail"]["codigo"] == "TOKEN_INVALIDO"


def test_sin_token_responde_401_con_www_authenticate(protegido: TestClient) -> None:
    respuesta = protegido.get("/protegida")

    assert respuesta.status_code == 401
    assert respuesta.headers["www-authenticate"] == "Bearer"
    detalle = respuesta.json()["detail"]
    assert detalle["codigo"] == "TOKEN_INVALIDO"
    assert detalle["mensaje"]


def test_acepta_el_token_en_authorization_bearer(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    respuesta = protegido.get(
        "/protegida", headers={"Authorization": f"Bearer {emitir(clave_privada)}"}
    )

    assert respuesta.status_code == 200
    assert respuesta.json() == {"id": USUARIO_ID, "email": "admin@apuestas.test"}


def test_el_esquema_bearer_no_distingue_mayusculas(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    respuesta = protegido.get(
        "/protegida", headers={"Authorization": f"bearer {emitir(clave_privada)}"}
    )

    assert respuesta.status_code == 200


def test_acepta_el_token_en_la_cookie_acceso(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    protegido.cookies.set("acceso", emitir(clave_privada))

    assert protegido.get("/protegida").status_code == 200


def test_otro_esquema_de_authorization_no_cuenta_como_token(protegido: TestClient) -> None:
    respuesta = protegido.get("/protegida", headers={"Authorization": "Basic YWRtaW46YWRtaW4="})

    assert respuesta.status_code == 401


def test_la_cabecera_bearer_prevalece_sobre_la_cookie(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    protegido.cookies.set("acceso", emitir(clave_privada))

    _afirmar_401(protegido, "token-alterado")


def test_rechaza_la_firma_de_otra_clave(protegido: TestClient) -> None:
    _afirmar_401(protegido, emitir(generar_ed25519()))


def test_rechaza_un_token_alterado(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    cabecera, cuerpo, firma = emitir(clave_privada).split(".")
    otro_cuerpo = emitir(clave_privada, roles=["ADMINISTRADOR", "OPERADOR"]).split(".")[1]

    assert otro_cuerpo != cuerpo
    _afirmar_401(protegido, f"{cabecera}.{otro_cuerpo}.{firma}")


def test_rechaza_un_token_vencido(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    vencido = datetime.now(UTC) - timedelta(seconds=1)

    _afirmar_401(protegido, emitir(clave_privada, exp=vencido))


def test_rechaza_un_token_que_aun_no_es_valido(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    _afirmar_401(protegido, emitir(clave_privada, nbf=datetime.now(UTC) + timedelta(minutes=5)))


@pytest.mark.parametrize(
    "cambios",
    [{"iss": "otra-api"}, {"aud": "otra-audiencia"}],
    ids=["emisor", "audiencia"],
)
def test_rechaza_emisor_o_audiencia_distintos(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey, cambios: dict[str, object]
) -> None:
    _afirmar_401(protegido, emitir_con(clave_privada, cambios))


@pytest.mark.parametrize("claim", ["sub", "exp", "iss", "aud", "roles"])
def test_rechaza_un_token_sin_claims_obligatorios(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey, claim: str
) -> None:
    _afirmar_401(protegido, emitir_con(clave_privada, {claim: None}))


@pytest.mark.parametrize(
    "cambios",
    [{"roles": "ADMINISTRADOR"}, {"roles": [1, 2]}, {"sub": ""}],
    ids=["roles-texto", "roles-no-texto", "sub-vacio"],
)
def test_rechaza_claims_con_forma_invalida(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey, cambios: dict[str, object]
) -> None:
    _afirmar_401(protegido, emitir_con(clave_privada, cambios))


def test_rechaza_alg_none(protegido: TestClient) -> None:
    _afirmar_401(protegido, forjar_sin_firma())


def test_rechaza_hs256_firmado_con_la_clave_publica(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    # Confusión de algoritmo: quien conoce la clave pública la usa como secreto HMAC.
    _afirmar_401(protegido, forjar_hs256(pem_publica(clave_privada).encode()))


@pytest.mark.parametrize("token", ["", "no-es-un-jwt", "a.b.c"])
def test_rechaza_textos_que_no_son_un_jwt(protegido: TestClient, token: str) -> None:
    respuesta = protegido.get("/protegida", headers={"Authorization": f"Bearer {token}"})

    assert respuesta.status_code == 401


def test_token_valido_sin_rol_de_administrador_responde_403(
    protegido: TestClient, clave_privada: ed25519.Ed25519PrivateKey
) -> None:
    token = emitir(clave_privada, roles=["APOSTADOR", "OPERADOR"])

    respuesta = protegido.get("/protegida", headers={"Authorization": f"Bearer {token}"})

    assert respuesta.status_code == 403
    assert respuesta.json()["detail"]["codigo"] == "SIN_PERMISO"


def test_rs256_acepta_tokens_rsa_y_rechaza_eddsa(configuracion: Configuracion) -> None:
    rsa_privada = generar_rsa()
    config_rsa = configuracion.model_copy(
        update={"jwt_algorithm": "RS256", "jwt_public_key": pem_publica(rsa_privada)}
    )
    cliente = _app_protegida(config_rsa)

    assert _con_bearer(cliente, emitir(rsa_privada, algoritmo="RS256")) == 200
    assert _con_bearer(cliente, emitir(rsa_privada, algoritmo="RS512")) == 401
    assert _con_bearer(cliente, emitir(generar_ed25519())) == 401
