"""Filtros de los reportes: rango obligatorio en UTC y filtros opcionales (FR-028, FR-029).

Los valores validados solo viajan a la base como parámetros de psycopg (FR-030).
"""

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import HTTPException, Query, status

MAXIMO_DIAS = 366
LARGO_MAXIMO_DEPORTE = 50
LARGO_MAXIMO_CORREO = 254
_FECHA = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_CORREO = re.compile(r"[^@\s]+@[^@\s]+")


class ErrorFiltros(ValueError):
    """Filtro inválido; el mensaje dice cómo corregirlo."""


@dataclass(frozen=True)
class Filtros:
    desde: date
    hasta: date
    deporte: str | None = None
    competicion_id: str | None = None
    usuario: str | None = None

    @property
    def inicio(self) -> datetime:
        return datetime.combine(self.desde, time.min, tzinfo=UTC)

    @property
    def fin(self) -> datetime:
        """Límite exclusivo: medianoche UTC del día siguiente a `hasta` (que va incluido)."""
        return datetime.combine(self.hasta + timedelta(days=1), time.min, tzinfo=UTC)

    @property
    def cantidad_dias(self) -> int:
        return (self.hasta - self.desde).days + 1

    @property
    def usuario_id(self) -> str | None:
        return self.usuario if self.usuario and "@" not in self.usuario else None

    @property
    def correo(self) -> str | None:
        return self.usuario if self.usuario and "@" in self.usuario else None


def _vacio_a_none(valor: str | None) -> str | None:
    if valor is None:
        return None
    limpio = valor.strip()
    return limpio or None


def _fecha(nombre: str, valor: str | None) -> date:
    texto = (valor or "").strip()
    if valor is None:
        raise ErrorFiltros(f"Indica `{nombre}`, una fecha con el formato AAAA-MM-DD.")
    if _FECHA.fullmatch(texto):
        try:
            return date.fromisoformat(texto)
        except ValueError:
            pass
    raise ErrorFiltros(
        f"`{nombre}` debe ser una fecha válida con el formato AAAA-MM-DD, por ejemplo 2026-12-01."
    )


def _uuid(valor: str) -> str | None:
    try:
        return str(UUID(valor))
    except ValueError:
        return None


def _competicion(valor: str | None) -> str | None:
    texto = _vacio_a_none(valor)
    if texto is None:
        return None
    competicion = _uuid(texto)
    if competicion is None:
        raise ErrorFiltros("`competicionId` debe ser el identificador (uuid) de una competición.")
    return competicion


def _usuario(valor: str | None) -> str | None:
    texto = _vacio_a_none(valor)
    if texto is None:
        return None
    como_uuid = _uuid(texto)
    if como_uuid is not None:
        return como_uuid
    if len(texto) <= LARGO_MAXIMO_CORREO and _CORREO.fullmatch(texto):
        return texto
    raise ErrorFiltros("`usuario` debe ser el identificador (uuid) o el correo exacto del usuario.")


def _deporte(valor: str | None) -> str | None:
    texto = _vacio_a_none(valor)
    if texto is not None and len(texto) > LARGO_MAXIMO_DEPORTE:
        raise ErrorFiltros(f"`deporte` admite como máximo {LARGO_MAXIMO_DEPORTE} caracteres.")
    return texto


def validar_filtros(
    *,
    desde: str | None,
    hasta: str | None,
    deporte: str | None,
    competicion_id: str | None,
    usuario: str | None,
) -> Filtros:
    inicio = _fecha("desde", desde)
    fin = _fecha("hasta", hasta)
    if fin < inicio:
        raise ErrorFiltros("`hasta` debe ser igual o posterior a `desde`.")
    filtros = Filtros(
        desde=inicio,
        hasta=fin,
        deporte=_deporte(deporte),
        competicion_id=_competicion(competicion_id),
        usuario=_usuario(usuario),
    )
    if filtros.cantidad_dias > MAXIMO_DIAS:
        raise ErrorFiltros(
            f"El rango admite como máximo {MAXIMO_DIAS} días: acerca `desde` y `hasta`."
        )
    return filtros


def error_de_filtros(mensaje: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"codigo": "FILTROS_INVALIDOS", "mensaje": mensaje},
    )


def leer_filtros(
    desde: Annotated[str | None, Query()] = None,
    hasta: Annotated[str | None, Query()] = None,
    deporte: Annotated[str | None, Query()] = None,
    competicion_id: Annotated[str | None, Query(alias="competicionId")] = None,
    usuario: Annotated[str | None, Query()] = None,
) -> Filtros:
    """Dependencia de FastAPI: los parámetros llegan como texto y se validan aquí (400)."""
    try:
        return validar_filtros(
            desde=desde,
            hasta=hasta,
            deporte=deporte,
            competicion_id=competicion_id,
            usuario=usuario,
        )
    except ErrorFiltros as error:
        raise error_de_filtros(str(error)) from None
