"""Exportación del reporte en CSV y PDF (HU7, FR-032; research.md §10).

CSV con BOM (Excel lo abre como UTF-8) y celdas de texto neutralizadas: una que empiece con `=`,
`+`, `-`, `@`, tabulador o retorno se prefija con `'` para que la hoja no la ejecute como fórmula.
Los importes y conteos que calcula reportes se escriben como número (un GGR negativo sigue siendo
número). PDF con fpdf2: título, filtros, fecha de generación, métricas, serie diaria con barras y
desglose por competición.
"""

import csv
import io
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from fpdf import FPDF, XPos, YPos

from reports.modelos import (
    DiaSerie,
    FiltrosAplicados,
    Reporte,
    RespuestaCompeticiones,
    RespuestaResumen,
    formatear_instante,
    redondear,
)

TITULO = "Reporte de apuestas deportivas"
PREFIJOS_PELIGROSOS = ("=", "+", "-", "@", "\t", "\r")
ENCABEZADO_SERIE = [
    "Fecha",
    "Apuestas",
    "Volumen",
    "Premios pagados",
    "GGR",
    "Depósitos",
    "Retiros",
]
ENCABEZADO_COMPETICIONES = ["Competición", "Deporte", "Apuestas", "Volumen", "GGR"]

Celda = str | int | Decimal | date


def neutralizar(celda: str) -> str:
    return f"'{celda}" if celda.startswith(PREFIJOS_PELIGROSOS) else celda


def _formatear(valor: Celda) -> str:
    if isinstance(valor, Decimal):
        return str(redondear(valor))
    if isinstance(valor, int):
        return str(valor)
    if isinstance(valor, date):
        return valor.isoformat()
    return valor


def _texto_csv(valor: Celda) -> str:
    """Números y fechas generados por reportes van tal cual; todo texto pasa por `neutralizar`."""
    return neutralizar(valor) if isinstance(valor, str) else _formatear(valor)


def _filtros(filtros: FiltrosAplicados) -> list[tuple[str, Celda]]:
    return [
        ("Desde", filtros.desde),
        ("Hasta", filtros.hasta),
        ("Deporte", filtros.deporte or "Todos"),
        ("Competición", filtros.competicion_id or "Todas"),
        ("Usuario", filtros.usuario or "Todos"),
    ]


def metricas(resumen: RespuestaResumen) -> list[tuple[str, int | Decimal]]:
    """Las métricas del resumen en el orden en que se exportan."""
    apuestas, cupones, alertas = resumen.apuestas, resumen.cupones, resumen.alertas
    return [
        ("Apuestas", apuestas.cantidad),
        ("Volumen apostado", apuestas.volumen),
        ("Premios pagados", apuestas.premios_pagados),
        ("GGR", apuestas.ggr),
        ("Usuarios activos", apuestas.usuarios_activos),
        ("Depósitos", resumen.depositos.cantidad),
        ("Monto depositado", resumen.depositos.monto),
        ("Retiros", resumen.retiros.cantidad),
        ("Monto retirado", resumen.retiros.monto),
        ("Canjes aceptados", cupones.canjes_aceptados),
        ("Canjes rechazados", cupones.canjes_rechazados),
        ("Bono otorgado", cupones.bono_otorgado),
        ("Alertas abiertas", alertas.abiertas),
        ("Alertas confirmadas", alertas.confirmadas),
        ("Alertas descartadas", alertas.descartadas),
        ("Alertas de severidad alta", alertas.altas),
        ("Alertas de severidad media", alertas.medias),
    ]


def _fila_dia(dia: DiaSerie) -> list[Celda]:
    return [
        dia.fecha,
        dia.apuestas,
        dia.volumen,
        dia.premios_pagados,
        dia.ggr,
        dia.depositos,
        dia.retiros,
    ]


def _filas_competiciones(competiciones: RespuestaCompeticiones) -> list[list[Celda]]:
    return [
        [c.nombre, c.deporte, c.apuestas, c.volumen, c.ggr] for c in competiciones.competiciones
    ]


def _filas_csv(reporte: Reporte) -> list[Sequence[Celda]]:
    resumen = reporte.resumen
    return [
        [TITULO],
        ["Generado en (UTC)", formatear_instante(resumen.generado_en)],
        *_filtros(resumen.filtros),
        [],
        ["Resumen"],
        ["Métrica", "Valor"],
        *metricas(resumen),
        [],
        ["Serie diaria"],
        ENCABEZADO_SERIE,
        *(_fila_dia(dia) for dia in reporte.serie.dias),
        [],
        ["Competiciones"],
        ENCABEZADO_COMPETICIONES,
        *_filas_competiciones(reporte.competiciones),
    ]


def generar_csv(reporte: Reporte) -> bytes:
    salida = io.StringIO()
    escritor = csv.writer(salida, lineterminator="\r\n")
    for fila in _filas_csv(reporte):
        escritor.writerow([_texto_csv(celda) for celda in fila])
    return ("﻿" + salida.getvalue()).encode("utf-8")


# --- PDF ---------------------------------------------------------------------------------------

MARGEN_MM = 10
ALTO_FILA_MM = 5
ANCHOS_SERIE_MM = (20, 15, 22, 28, 20, 22, 20)
ANCHO_BARRA_MM = 43
ANCHOS_COMPETICIONES_MM = (70, 35, 25, 30, 30)
COLOR_BARRA = (37, 99, 235)


def _latin1(texto: str) -> str:
    """Las fuentes base del PDF solo cubren latin-1: lo demás se reemplaza por `?`."""
    return texto.encode("latin-1", "replace").decode("latin-1")


class _Pdf(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("helvetica", size=8)
        self.cell(0, 8, f"Página {self.page_no()}", align="C")


def _linea(pdf: FPDF, texto: str, tamano: int = 10, estilo: str = "") -> None:
    pdf.set_font("helvetica", style=estilo, size=tamano)
    pdf.cell(0, ALTO_FILA_MM + 1, _latin1(texto), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _fila(pdf: FPDF, celdas: Sequence[str], anchos: Sequence[float], negrita: bool = False) -> None:
    pdf.set_font("helvetica", style="B" if negrita else "", size=8)
    for indice, (celda, ancho) in enumerate(zip(celdas, anchos, strict=True)):
        alineacion = "L" if indice == 0 else "R"
        pdf.cell(ancho, ALTO_FILA_MM, _latin1(celda), border="B", align=alineacion)


def _encabezado(pdf: FPDF, reporte: Reporte) -> None:
    _linea(pdf, TITULO, tamano=16, estilo="B")
    resumen = reporte.resumen
    _linea(pdf, f"Generado en (UTC): {formatear_instante(resumen.generado_en)}", tamano=9)
    for nombre, valor in _filtros(resumen.filtros):
        _linea(pdf, f"{nombre}: {_formatear(valor)}", tamano=9)
    pdf.ln(2)


def _tabla_metricas(pdf: FPDF, resumen: RespuestaResumen) -> None:
    _linea(pdf, "Resumen", tamano=12, estilo="B")
    _fila(pdf, ["Métrica", "Valor"], (80, 40), negrita=True)
    pdf.ln(ALTO_FILA_MM)
    for nombre, valor in metricas(resumen):
        _fila(pdf, [nombre, _formatear(valor)], (80, 40))
        pdf.ln(ALTO_FILA_MM)
    pdf.ln(3)


def _barra(pdf: FPDF, volumen: Decimal, maximo: Decimal) -> None:
    if maximo > 0 and volumen > 0:
        ancho = ANCHO_BARRA_MM * float(volumen / maximo)
        pdf.set_fill_color(*COLOR_BARRA)
        pdf.rect(pdf.get_x() + 1, pdf.get_y() + 1, max(ancho - 1, 0.5), ALTO_FILA_MM - 2, style="F")


def _tabla_serie(pdf: FPDF, dias: Sequence[DiaSerie]) -> None:
    _linea(pdf, "Serie diaria (barra: volumen apostado)", tamano=12, estilo="B")
    maximo = max((dia.volumen for dia in dias), default=Decimal(0))
    for indice, dia in enumerate(dias):
        if indice == 0 or pdf.will_page_break(ALTO_FILA_MM):
            if indice:
                pdf.add_page()
            _fila(pdf, ENCABEZADO_SERIE, ANCHOS_SERIE_MM, negrita=True)
            pdf.ln(ALTO_FILA_MM)
        _fila(pdf, [_formatear(celda) for celda in _fila_dia(dia)], ANCHOS_SERIE_MM)
        _barra(pdf, dia.volumen, maximo)
        pdf.ln(ALTO_FILA_MM)
    pdf.ln(3)


def _tabla_competiciones(pdf: FPDF, competiciones: RespuestaCompeticiones) -> None:
    _linea(pdf, "Competiciones (por volumen)", tamano=12, estilo="B")
    _fila(pdf, ENCABEZADO_COMPETICIONES, ANCHOS_COMPETICIONES_MM, negrita=True)
    pdf.ln(ALTO_FILA_MM)
    for fila in _filas_competiciones(competiciones):
        _fila(pdf, [_formatear(celda) for celda in fila], ANCHOS_COMPETICIONES_MM)
        pdf.ln(ALTO_FILA_MM)


def generar_pdf(reporte: Reporte) -> bytes:
    pdf = _Pdf(orientation="portrait", unit="mm", format="A4")
    pdf.set_margins(MARGEN_MM, MARGEN_MM, MARGEN_MM)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_title(TITULO)
    pdf.set_creation_date(reporte.resumen.generado_en)
    pdf.add_page()
    _encabezado(pdf, reporte)
    _tabla_metricas(pdf, reporte.resumen)
    _tabla_serie(pdf, reporte.serie.dias)
    _tabla_competiciones(pdf, reporte.competiciones)
    return bytes(pdf.output())
