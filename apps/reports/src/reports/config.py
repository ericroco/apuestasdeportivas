"""Configuración de apps/reports desde el entorno (spec 1 y spec 4, contracts/configuracion.md)."""

from typing import Literal

from cryptography.hazmat.primitives.asymmetric import ed25519, rsa
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from pydantic import (
    AnyHttpUrl,
    Field,
    PostgresDsn,
    ValidationError,
    ValidationInfo,
    field_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

# Lista explícita (contrato 6): nunca `none` ni HMAC, que permitirían firmar con la clave pública.
AlgoritmoJwt = Literal["EdDSA", "RS256"]
ClavePublica = ed25519.Ed25519PublicKey | rsa.RSAPublicKey
BITS_MINIMOS_RSA = 2048


class ErrorConfiguracion(Exception):
    """Falta una variable obligatoria o es inválida. El mensaje nunca incluye valores."""


def cargar_clave_publica(pem: str, algoritmo: AlgoritmoJwt) -> ClavePublica:
    """Carga la clave PEM y comprueba que sirve para el algoritmo; ValueError si no."""
    try:
        clave = load_pem_public_key(pem.encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError):
        raise ValueError("no es una clave pública PEM válida") from None
    if algoritmo == "EdDSA" and isinstance(clave, ed25519.Ed25519PublicKey):
        return clave
    if algoritmo == "RS256" and isinstance(clave, rsa.RSAPublicKey):
        if clave.key_size < BITS_MINIMOS_RSA:
            raise ValueError(f"la clave RSA debe tener al menos {BITS_MINIMOS_RSA} bits")
        return clave
    raise ValueError("la clave no corresponde a JWT_ALGORITHM (EdDSA usa Ed25519; RS256, RSA)")


class Configuracion(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    reports_database_url: PostgresDsn
    web_origin: AnyHttpUrl
    # jwt_algorithm va antes que la clave para que su validador lo conozca.
    jwt_algorithm: AlgoritmoJwt = "EdDSA"
    jwt_public_key: str
    jwt_issuer: str = Field(default="apuestas-api", min_length=1)
    jwt_audience: str = Field(default="apuestas", min_length=1)
    host: str = "127.0.0.1"
    port: int = Field(default=8000, gt=0, lt=65536)

    @field_validator("jwt_public_key")
    @classmethod
    def _validar_clave_publica(cls, valor: str, info: ValidationInfo) -> str:
        # Render y los .env guardan la clave en una línea: se aceptan los `\n` escapados.
        pem = valor.replace("\\n", "\n").strip()
        algoritmo = info.data.get("jwt_algorithm")
        if algoritmo is not None:
            cargar_clave_publica(pem, algoritmo)
        return pem


def cargar_configuracion(env_file: str | None = ".env") -> Configuracion:
    """Lee y valida la configuración; traduce el error de pydantic a uno sin valores secretos."""
    try:
        return Configuracion(_env_file=env_file)
    except ValidationError as error:
        problemas = "; ".join(
            f"{'.'.join(str(parte) for parte in detalle['loc']).upper()}: {detalle['msg']}"
            for detalle in error.errors(include_input=False, include_url=False)
        )
        raise ErrorConfiguracion(f"Configuración inválida de apps/reports. {problemas}") from None
