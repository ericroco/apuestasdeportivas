"""Comprobación de salud de reportes (contrato contracts/salud.openapi.yaml del spec 1)."""

import time
from collections.abc import Callable
from datetime import UTC, datetime
from importlib.metadata import version
from typing import Literal

import psycopg
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# psycopg acepta segundos enteros (mínimo 2); el statement_timeout va en milisegundos.
TIMEOUT_DEPENDENCIA_S = 2
VERSION = version("reports")

EstadoSalud = Literal["ok", "error"]


class _Modelo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class EstadoDependencia(_Modelo):
    estado: EstadoSalud
    latencia_ms: int


class RespuestaSalud(_Modelo):
    estado: EstadoSalud
    servicio: Literal["reports"] = "reports"
    version: str
    fecha: str
    dependencias: dict[str, EstadoDependencia]


SondaBaseDeDatos = Callable[[], EstadoDependencia]


def _milisegundos_desde(inicio: float) -> int:
    return round((time.perf_counter() - inicio) * 1000)


def comprobar_base_de_datos(url: str) -> EstadoDependencia:
    """Abre una conexión con el usuario de solo lectura y ejecuta SELECT 1 con timeout."""
    inicio = time.perf_counter()
    try:
        with psycopg.connect(
            url,
            connect_timeout=TIMEOUT_DEPENDENCIA_S,
            options=f"-c statement_timeout={TIMEOUT_DEPENDENCIA_S * 1000}",
        ) as conexion:
            conexion.execute("SELECT 1")
    except psycopg.Error:
        # El detalle (host, usuario, mensaje del servidor) no se expone (FR-005).
        return EstadoDependencia(estado="error", latencia_ms=_milisegundos_desde(inicio))
    return EstadoDependencia(estado="ok", latencia_ms=_milisegundos_desde(inicio))


def construir_respuesta(base_de_datos: EstadoDependencia) -> RespuestaSalud:
    return RespuestaSalud(
        estado=base_de_datos.estado,
        version=VERSION,
        fecha=datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        dependencias={"baseDeDatos": base_de_datos},
    )
