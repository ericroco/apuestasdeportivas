"""Claves y tokens de prueba: pares Ed25519 y RSA generados en memoria (nunca se versionan)."""

import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, rsa

EMISOR = "apuestas-api"
AUDIENCIA = "apuestas"
USUARIO_ID = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"

ClavePrivada = ed25519.Ed25519PrivateKey | rsa.RSAPrivateKey


def generar_ed25519() -> ed25519.Ed25519PrivateKey:
    return ed25519.Ed25519PrivateKey.generate()


def generar_rsa(bits: int = 2048) -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=bits)


def pem_publica(clave: ClavePrivada) -> str:
    return (
        clave.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("ascii")
    )


def claims_de_administrador(**cambios: object) -> dict[str, object]:
    ahora = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": USUARIO_ID,
        "email": "admin@apuestas.test",
        "roles": ["ADMINISTRADOR"],
        "iat": ahora,
        "exp": ahora + timedelta(minutes=15),
        "iss": EMISOR,
        "aud": AUDIENCIA,
    }
    claims.update(cambios)
    return claims


def _sin_nulos(cambios: dict[str, object]) -> dict[str, object]:
    return {k: v for k, v in claims_de_administrador(**cambios).items() if v is not None}


def emitir_con(clave: ClavePrivada, cambios: dict[str, object], algoritmo: str = "EdDSA") -> str:
    """Firma un token de administrador; `cambios` reemplaza claims (None los quita)."""
    return jwt.encode(_sin_nulos(cambios), clave, algorithm=algoritmo)


def emitir(clave: ClavePrivada, algoritmo: str = "EdDSA", **cambios: object) -> str:
    return emitir_con(clave, cambios, algoritmo)


def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode("ascii")


def _segmentos(algoritmo: str, cambios: dict[str, object]) -> str:
    claims = {
        k: int(v.timestamp()) if isinstance(v, datetime) else v
        for k, v in _sin_nulos(cambios).items()
    }
    cabecera = json.dumps({"alg": algoritmo, "typ": "JWT"}).encode()
    return f"{_b64(cabecera)}.{_b64(json.dumps(claims).encode())}"


def forjar_sin_firma(**cambios: object) -> str:
    """Token con `alg: none` (ataque clásico: sin firma)."""
    return f"{_segmentos('none', cambios)}."


def forjar_hs256(secreto: bytes, **cambios: object) -> str:
    """Token HS256 firmado con `secreto` (confusión de algoritmo: la clave pública como HMAC)."""
    cuerpo = _segmentos("HS256", cambios)
    firma = hmac.new(secreto, cuerpo.encode("ascii"), hashlib.sha256).digest()
    return f"{cuerpo}.{_b64(firma)}"
