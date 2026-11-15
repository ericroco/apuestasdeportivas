"""Aplicación FastAPI de reportes. `crear_app` es una factory para inyectar la configuración."""

from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from reports.config import Configuracion, cargar_configuracion
from reports.consultas import conectar
from reports.health import (
    VERSION,
    RespuestaSalud,
    SondaBaseDeDatos,
    comprobar_base_de_datos,
    construir_respuesta,
)
from reports.rutas import router
from reports.seguridad import VerificadorToken


def obtener_sonda_base_de_datos(request: Request) -> SondaBaseDeDatos:
    url = str(request.app.state.configuracion.reports_database_url)
    return lambda: comprobar_base_de_datos(url)


def crear_app(configuracion: Configuracion | None = None) -> FastAPI:
    config = configuracion or cargar_configuracion()
    app = FastAPI(title="Reportes: apuestas deportivas", version=VERSION)
    app.state.configuracion = config
    # Se crea al arrancar: una clave pública inválida impide levantar el servicio.
    app.state.verificador = VerificadorToken.desde_configuracion(config)
    url = str(config.reports_database_url)
    app.state.fabrica_conexiones = lambda: conectar(url)
    app.include_router(router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(config.web_origin).rstrip("/")],
        allow_methods=["GET"],
        allow_credentials=True,
    )

    @app.get("/health", response_model=RespuestaSalud, response_model_by_alias=True)
    def salud(
        response: Response,
        sonda: Annotated[SondaBaseDeDatos, Depends(obtener_sonda_base_de_datos)],
    ) -> RespuestaSalud:
        respuesta = construir_respuesta(sonda())
        if respuesta.estado != "ok":
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return respuesta

    return app
