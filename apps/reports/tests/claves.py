"""Claves y tokens de prueba: pares Ed25519 y RSA generados en memoria (nunca se versionan)."""

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


def emitir(clave: ClavePrivada, algoritmo: str = "EdDSA", **cambios: object) -> str:
    """Firma un token de administrador; `cambios` reemplaza claims (None los quita)."""
    claims = {k: v for k, v in claims_de_administrador(**cambios).items() if v is not None}
    return jwt.encode(claims, clave, algorithm=algoritmo)
