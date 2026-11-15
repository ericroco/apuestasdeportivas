"""Arranque: `python -m reports [--reload]`. Valida la configuración antes de levantar uvicorn."""

import logging
import sys

import uvicorn

from reports.config import ErrorConfiguracion, cargar_configuracion

registro = logging.getLogger("reports")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    try:
        config = cargar_configuracion()
    except ErrorConfiguracion as error:
        registro.error("%s", error)
        sys.exit(1)
    uvicorn.run(
        "reports.main:crear_app",
        factory=True,
        host=config.host,
        port=config.port,
        reload="--reload" in sys.argv,
    )


if __name__ == "__main__":
    main()
