"""SOLO DESARROLLO: genera un par Ed25519 en memoria e imprime la clave pública y un token.

Mientras el Spec 2 no emita tokens, permite probar /reportes en local:

    uv run python -m reports.herramientas.clave_dev [--roles ADMINISTRADOR OPERADOR ...]

La clave privada nunca se escribe ni se imprime: se descarta al terminar, así que cada ejecución da
un par nuevo (hay que actualizar JWT_PUBLIC_KEY en .env y reiniciar reportes). No escribe archivos.
"""

import argparse
import os
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519

ROLES = ("APOSTADOR", "OPERADOR", "ADMINISTRADOR")
VIGENCIA = timedelta(minutes=15)  # el máximo del contrato 6


def pem_en_una_linea(clave: ed25519.Ed25519PublicKey) -> str:
    pem = clave.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    return pem.strip().replace("\n", "\\n")


def emitir_token(privada: ed25519.Ed25519PrivateKey, roles: Sequence[str]) -> str:
    ahora = datetime.now(UTC).replace(microsecond=0)
    claims = {
        "sub": str(uuid4()),
        "email": "admin@local.test",
        "roles": list(roles),
        "iat": ahora,
        "exp": ahora + VIGENCIA,
        "iss": os.environ.get("JWT_ISSUER", "apuestas-api"),
        "aud": os.environ.get("JWT_AUDIENCE", "apuestas"),
    }
    return jwt.encode(claims, privada, algorithm="EdDSA")


def _argumentos(argumentos: Sequence[str] | None) -> argparse.Namespace:
    analizador = argparse.ArgumentParser(
        prog="clave_dev", description="Par Ed25519 y token de prueba (solo desarrollo)."
    )
    analizador.add_argument("--roles", nargs="+", choices=ROLES, default=["ADMINISTRADOR"])
    return analizador.parse_args(argumentos)


def main(argumentos: Sequence[str] | None = None) -> None:
    roles = _argumentos(argumentos).roles
    privada = ed25519.Ed25519PrivateKey.generate()
    print("# SOLO DESARROLLO. La clave privada se descarta al terminar.")
    print("# 1) Pega esta línea en apps/reports/.env y reinicia reportes:")
    print(f"JWT_PUBLIC_KEY={pem_en_una_linea(privada.public_key())}")
    print(f"# 2) Token con roles {', '.join(roles)} (vence en 15 minutos):")
    print(emitir_token(privada, roles))
    print('# Uso: curl -H "Authorization: Bearer <token>" \\')
    print('#   "http://localhost:8000/reportes/resumen?desde=2026-12-01&hasta=2026-12-31"')


if __name__ == "__main__":  # pragma: no cover
    main()
