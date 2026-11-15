"""Router /reportes (contracts/reportes.md §2): solo GET y solo para administradores.

Orden de cada petición: token (401/403) → filtros (400) → conexión de solo lectura → consultas.
Si falta una tabla o columna de otro spec, o la base no responde, la ruta responde 503
`DATOS_NO_DISPONIBLES` en lugar de cifras incompletas.
"""

import logging
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Annotated, Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from reports import servicio
from reports.consultas import Conexion
from reports.exportar import generar_csv, generar_pdf
from reports.filtros import Filtros, error_de_filtros, leer_filtros
from reports.modelos import RespuestaCompeticiones, RespuestaResumen, RespuestaSerieDiaria
from reports.seguridad import Administrador, requerir_administrador

registro = logging.getLogger("reports.rutas")

FabricaConexiones = Callable[[], Conexion]

MENSAJE_FALTAN_DATOS = (
    "Los datos de este reporte todavía no están disponibles: falta información de otro módulo."
)
MENSAJE_SIN_BASE = "La base de datos de reportes no responde; vuelve a intentarlo en unos minutos."
SIN_CACHE = "no-store"


def ahora() -> datetime:
    return datetime.now(UTC)


def _no_disponible(mensaje: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"codigo": "DATOS_NO_DISPONIBLES", "mensaje": mensaje},
    )


@contextmanager
def datos_disponibles() -> Iterator[None]:
    """Traduce las fallas de la base a 503 sin exponer tablas ni detalles del servidor."""
    try:
        yield
    except (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn) as error:
        registro.warning(
            "Reporte sin datos: %s", error.diag.message_primary or type(error).__name__
        )
        raise _no_disponible(MENSAJE_FALTAN_DATOS) from None
    except psycopg.OperationalError as error:
        registro.error("La base de reportes falló: %s", type(error).__name__)
        raise _no_disponible(MENSAJE_SIN_BASE) from None


def abrir_conexion(
    request: Request, _admin: Annotated[Administrador, Depends(requerir_administrador)]
) -> Iterator[Conexion]:
    """Conexión por petición; depende del administrador para no abrirse nunca sin token válido."""
    fabrica: FabricaConexiones = request.app.state.fabrica_conexiones
    with datos_disponibles():
        conexion = fabrica()
    with conexion:
        yield conexion


FiltrosDep = Annotated[Filtros, Depends(leer_filtros)]
ConexionDep = Annotated[Conexion, Depends(abrir_conexion)]

router = APIRouter(
    prefix="/reportes", tags=["reportes"], dependencies=[Depends(requerir_administrador)]
)


@router.get("/resumen", response_model=RespuestaResumen)
def resumen(filtros: FiltrosDep, conexion: ConexionDep, response: Response) -> RespuestaResumen:
    response.headers["Cache-Control"] = SIN_CACHE
    with datos_disponibles():
        return servicio.obtener_resumen(conexion, filtros, ahora())


@router.get("/serie-diaria", response_model=RespuestaSerieDiaria)
def serie_diaria(
    filtros: FiltrosDep, conexion: ConexionDep, response: Response
) -> RespuestaSerieDiaria:
    response.headers["Cache-Control"] = SIN_CACHE
    with datos_disponibles():
        return servicio.obtener_serie(conexion, filtros)


@router.get("/competiciones", response_model=RespuestaCompeticiones)
def competiciones(
    filtros: FiltrosDep, conexion: ConexionDep, response: Response
) -> RespuestaCompeticiones:
    response.headers["Cache-Control"] = SIN_CACHE
    with datos_disponibles():
        return servicio.obtener_competiciones(conexion, filtros)


Formato = Literal["csv", "pdf"]
TIPOS_DE_CONTENIDO: dict[Formato, str] = {
    "csv": "text/csv; charset=utf-8",
    "pdf": "application/pdf",
}


def leer_formato(formato: Annotated[str | None, Query()] = None) -> Formato:
    """`formato` se valida junto con los filtros, antes de abrir la base."""
    if formato == "csv":
        return "csv"
    if formato == "pdf":
        return "pdf"
    raise error_de_filtros("`formato` debe ser csv o pdf.")


@router.get("/exportar", response_class=Response)
def exportar(
    filtros: FiltrosDep,
    formato: Annotated[Formato, Depends(leer_formato)],
    conexion: ConexionDep,
) -> Response:
    with datos_disponibles():
        reporte = servicio.obtener_reporte(conexion, filtros, ahora())
    contenido = generar_csv(reporte) if formato == "csv" else generar_pdf(reporte)
    nombre = f"reporte-{filtros.desde.isoformat()}-{filtros.hasta.isoformat()}.{formato}"
    return Response(
        content=contenido,
        media_type=TIPOS_DE_CONTENIDO[formato],
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "Cache-Control": SIN_CACHE,
        },
    )
