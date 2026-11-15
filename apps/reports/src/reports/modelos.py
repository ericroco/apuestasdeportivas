"""Respuestas de /reportes (contracts/reportes.md §2): camelCase y montos como texto."""

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel

from reports.filtros import Filtros

CENTAVO = Decimal("0.01")
CERO = Decimal("0.00")


def redondear(valor: Decimal) -> Decimal:
    """Centavos con redondeo comercial (mitad hacia arriba) y sin cero negativo."""
    redondeado = valor.quantize(CENTAVO, rounding=ROUND_HALF_UP)
    return CERO if redondeado.is_zero() else redondeado


def formatear_instante(valor: datetime) -> str:
    return valor.replace(microsecond=0).isoformat().replace("+00:00", "Z")


# El dinero se calcula con Decimal (nunca float) y se publica como texto: "15200.00".
Monto = Annotated[Decimal, AfterValidator(redondear), PlainSerializer(str, return_type=str)]
Instante = Annotated[datetime, PlainSerializer(formatear_instante, return_type=str)]


class _Modelo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class FiltrosAplicados(_Modelo):
    desde: date
    hasta: date
    deporte: str | None
    competicion_id: str | None
    usuario: str | None

    @classmethod
    def de(cls, filtros: Filtros) -> "FiltrosAplicados":
        return cls(
            desde=filtros.desde,
            hasta=filtros.hasta,
            deporte=filtros.deporte,
            competicion_id=filtros.competicion_id,
            usuario=filtros.usuario,
        )


class MetricasApuestas(_Modelo):
    cantidad: int
    volumen: Monto
    premios_pagados: Monto
    ggr: Monto
    usuarios_activos: int


class MetricasMovimientos(_Modelo):
    cantidad: int
    monto: Monto


class MetricasCupones(_Modelo):
    canjes_aceptados: int
    canjes_rechazados: int
    bono_otorgado: Monto


class MetricasAlertas(_Modelo):
    abiertas: int
    confirmadas: int
    descartadas: int
    altas: int
    medias: int


class RespuestaResumen(_Modelo):
    filtros: FiltrosAplicados
    apuestas: MetricasApuestas
    depositos: MetricasMovimientos
    retiros: MetricasMovimientos
    cupones: MetricasCupones
    alertas: MetricasAlertas
    generado_en: Instante


class DiaSerie(_Modelo):
    fecha: date
    volumen: Monto
    premios_pagados: Monto
    ggr: Monto
    apuestas: int
    depositos: Monto
    retiros: Monto


class RespuestaSerieDiaria(_Modelo):
    filtros: FiltrosAplicados
    dias: list[DiaSerie]


class CompeticionDesglose(_Modelo):
    competicion_id: str
    nombre: str
    deporte: str
    apuestas: int
    volumen: Monto
    ggr: Monto


class RespuestaCompeticiones(_Modelo):
    filtros: FiltrosAplicados
    competiciones: list[CompeticionDesglose]
