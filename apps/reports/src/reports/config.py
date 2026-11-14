"""Configuración de apps/reports desde el entorno (spec 1, contracts/configuracion.md)."""

from pydantic import AnyHttpUrl, Field, PostgresDsn, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class ErrorConfiguracion(Exception):
    """Falta una variable obligatoria o es inválida. El mensaje nunca incluye valores."""


class Configuracion(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    reports_database_url: PostgresDsn
    web_origin: AnyHttpUrl
    host: str = "127.0.0.1"
    port: int = Field(default=8000, gt=0, lt=65536)


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
