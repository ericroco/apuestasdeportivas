"""Reportes contra PostgreSQL real con el usuario reportes_lectura (HU6, T051; SC-006, SC-007).

Cada prueba trabaja en esquemas propios `reportes_prueba_<azar>` que el dueño crea con las tablas
de contracts/reportes.md §3 y datos conocidos, y borra al terminar: nunca toca `public`. Reportes
se conecta como reportes_lectura con `search_path` en ese esquema y una zona horaria distinta de
UTC, para comprobar que los días se cortan en UTC.
"""

import time
from collections.abc import Iterable, Iterator
from datetime import datetime
from decimal import Decimal
from urllib.parse import quote, urlencode
from uuid import uuid4

import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi.testclient import TestClient
from psycopg import sql
from pydantic_settings import BaseSettings, SettingsConfigDict

from reports.config import Configuracion
from reports.main import crear_app

from .claves import emitir, pem_publica
from .datos_reportes import (
    COMPETICIONES,
    TABLAS,
    USUARIO_ANA,
    cargar_datos_conocidos,
    cargar_volumen,
    crear_tablas,
)

pytestmark = pytest.mark.integracion

Conexion = psycopg.Connection[tuple[object, ...]]
RANGO = {"desde": "2026-12-01", "hasta": "2026-12-03"}
C1, C2, C3 = COMPETICIONES


class _Urls(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    reports_database_url: str
    pruebas_database_url_propietario: str


@pytest.fixture(scope="module")
def urls() -> _Urls:
    return _Urls()


@pytest.fixture(scope="module")
def propietario(urls: _Urls) -> Iterator[Conexion]:
    # Sin sentencias preparadas: el mismo INSERT se repite en cada esquema y una preparada guardaría
    # los tipos enum del primer esquema.
    with psycopg.connect(
        urls.pruebas_database_url_propietario, autocommit=True, prepare_threshold=None
    ) as conexion:
        yield conexion


def _crear_esquema(propietario: Conexion, sufijo: str) -> str:
    """Crea `reportes_prueba_<azar>_<sufijo>` y lo deja primero en el search_path del dueño."""
    nombre = f"reportes_prueba_{uuid4().hex[:10]}_{sufijo}"
    propietario.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(nombre)))
    propietario.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(nombre)))
    return nombre


def _dar_lectura(propietario: Conexion, esquema: str) -> None:
    identificador = sql.Identifier(esquema)
    propietario.execute(
        sql.SQL("GRANT USAGE ON SCHEMA {} TO reportes_lectura").format(identificador)
    )
    propietario.execute(
        sql.SQL("GRANT SELECT ON ALL TABLES IN SCHEMA {} TO reportes_lectura").format(identificador)
    )


def _borrar_esquemas(propietario: Conexion, nombres: Iterable[str]) -> None:
    propietario.execute("RESET search_path")
    for nombre in nombres:
        propietario.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(nombre)))


@pytest.fixture(scope="module")
def esquemas(propietario: Conexion) -> Iterator[dict[str, str]]:
    """Esquemas `completo` (datos conocidos), `sin_retiro` y `vacio` (sin tablas)."""
    creados: dict[str, str] = {}
    try:
        for sufijo, omitir in [("completo", ()), ("sin_retiro", ("retiro",)), ("vacio", TABLAS)]:
            creados[sufijo] = _crear_esquema(propietario, sufijo)
            crear_tablas(propietario, omitir=set(omitir))
            if sufijo != "vacio":
                cargar_datos_conocidos(propietario, omitir=set(omitir))
            _dar_lectura(propietario, creados[sufijo])
        yield creados
    finally:
        _borrar_esquemas(propietario, creados.values())


def _url_en(urls: _Urls, esquema: str) -> str:
    opciones = quote(f"-c search_path={esquema} -c TimeZone=America/Guayaquil")
    separador = "&" if "?" in urls.reports_database_url else "?"
    return f"{urls.reports_database_url}{separador}options={opciones}"


def _cliente(urls: _Urls, esquema: str, clave: ed25519.Ed25519PrivateKey) -> TestClient:
    config = Configuracion(
        _env_file=None,
        reports_database_url=_url_en(urls, esquema),
        web_origin="http://localhost:3000",
        jwt_public_key=pem_publica(clave),
    )
    cliente = TestClient(crear_app(config))
    cliente.headers["Authorization"] = f"Bearer {emitir(clave)}"
    return cliente


@pytest.fixture(scope="module")
def cliente(
    urls: _Urls, esquemas: dict[str, str], clave_privada: ed25519.Ed25519PrivateKey
) -> TestClient:
    return _cliente(urls, esquemas["completo"], clave_privada)


def _con_rango(ruta: str) -> str:
    """Agrega RANGO a una ruta que ya puede traer su propia query (`params=` la reemplazaría)."""
    return f"{ruta}{'&' if '?' in ruta else '?'}{urlencode(RANGO)}"


def _resumen(cliente: TestClient, **filtros: str) -> dict[str, object]:
    respuesta = cliente.get("/reportes/resumen", params={**RANGO, **filtros})
    assert respuesta.status_code == 200, respuesta.text
    cuerpo: dict[str, object] = respuesta.json()
    return cuerpo


TOTALES_SIN_FILTRO_DE_APUESTAS = {
    "depositos": {"cantidad": 2, "monto": "150.50"},
    "retiros": {"cantidad": 1, "monto": "40.00"},
    "cupones": {"canjesAceptados": 3, "canjesRechazados": 2, "bonoOtorgado": "12.50"},
    "alertas": {"abiertas": 2, "confirmadas": 1, "descartadas": 1, "altas": 2, "medias": 2},
}


def test_resumen_coincide_al_centavo_con_el_calculo_a_mano(cliente: TestClient) -> None:
    cuerpo = _resumen(cliente)

    assert cuerpo["apuestas"] == {
        "cantidad": 5,
        "volumen": "55.00",
        "premiosPagados": "41.00",
        "ggr": "8.75",
        # Dani solo tiene una apuesta anulada: cuenta como activo aunque no sume al volumen.
        "usuariosActivos": 4,
    }
    for seccion, esperado in TOTALES_SIN_FILTRO_DE_APUESTAS.items():
        assert cuerpo[seccion] == esperado, seccion
    assert cuerpo["filtros"] == {**RANGO, "deporte": None, "competicionId": None, "usuario": None}
    assert datetime.fromisoformat(str(cuerpo["generadoEn"])).tzinfo is not None


@pytest.mark.parametrize(
    ("filtros", "apuestas"),
    [
        ({"competicionId": C1}, (2, "30.00", "25.50", "4.50", 2)),
        ({"deporte": "futbol"}, (3, "42.00", "25.50", "16.50", 3)),
        ({"deporte": "FUTBOL"}, (3, "42.00", "25.50", "16.50", 3)),
        ({"deporte": "baloncesto"}, (2, "13.00", "15.50", "-7.75", 2)),
        ({"deporte": "futbol", "competicionId": C3}, (0, "0.00", "0.00", "0.00", 0)),
    ],
    ids=["competicion", "deporte", "deporte-mayusculas", "otro-deporte", "sin-cruce"],
)
def test_deporte_y_competicion_filtran_solo_las_apuestas(
    cliente: TestClient, filtros: dict[str, str], apuestas: tuple[object, ...]
) -> None:
    cuerpo = _resumen(cliente, **filtros)

    claves = ("cantidad", "volumen", "premiosPagados", "ggr", "usuariosActivos")
    assert cuerpo["apuestas"] == dict(zip(claves, apuestas, strict=True))
    for seccion, esperado in TOTALES_SIN_FILTRO_DE_APUESTAS.items():
        assert cuerpo[seccion] == esperado, seccion


@pytest.mark.parametrize("usuario", [USUARIO_ANA, "ana@example.com", "ANA@example.com"])
def test_el_filtro_de_usuario_restringe_todas_las_metricas(
    cliente: TestClient, usuario: str
) -> None:
    cuerpo = _resumen(cliente, usuario=usuario)

    assert cuerpo["apuestas"] == {
        "cantidad": 2,
        "volumen": "30.00",
        "premiosPagados": "25.50",
        "ggr": "4.50",
        "usuariosActivos": 1,
    }
    assert cuerpo["depositos"] == {"cantidad": 1, "monto": "100.00"}
    assert cuerpo["retiros"] == {"cantidad": 1, "monto": "40.00"}
    assert cuerpo["cupones"] == {
        "canjesAceptados": 1,
        "canjesRechazados": 1,
        "bonoOtorgado": "10.00",
    }
    assert cuerpo["alertas"] == {
        "abiertas": 2,
        "confirmadas": 0,
        "descartadas": 0,
        "altas": 1,
        "medias": 1,
    }


CEROS = {
    "apuestas": {
        "cantidad": 0,
        "volumen": "0.00",
        "premiosPagados": "0.00",
        "ggr": "0.00",
        "usuariosActivos": 0,
    },
    "depositos": {"cantidad": 0, "monto": "0.00"},
    "retiros": {"cantidad": 0, "monto": "0.00"},
    "cupones": {"canjesAceptados": 0, "canjesRechazados": 0, "bonoOtorgado": "0.00"},
    "alertas": {"abiertas": 0, "confirmadas": 0, "descartadas": 0, "altas": 0, "medias": 0},
}


@pytest.mark.parametrize(
    "filtros",
    [
        {"usuario": "nadie@example.com"},
        {"usuario": "99999999-9999-4999-8999-999999999999"},
        {"desde": "2027-03-01", "hasta": "2027-03-31"},
    ],
    ids=["correo-desconocido", "uuid-desconocido", "rango-sin-datos"],
)
def test_sin_datos_responde_ceros(cliente: TestClient, filtros: dict[str, str]) -> None:
    cuerpo = _resumen(cliente, **filtros)

    for seccion, esperado in CEROS.items():
        assert cuerpo[seccion] == esperado, seccion


@pytest.mark.parametrize(
    ("dia", "apuestas", "depositos", "retiros"),
    [
        ("2026-11-30", (1, "50.00", "0.00", "50.00", 1), "0.00", "5.00"),
        ("2026-12-04", (1, "40.00", "80.00", "-40.00", 1), "70.00", "0.00"),
    ],
)
def test_los_limites_del_dia_son_medianoche_utc(
    cliente: TestClient,
    dia: str,
    apuestas: tuple[object, ...],
    depositos: str,
    retiros: str,
) -> None:
    cuerpo = _resumen(cliente, desde=dia, hasta=dia)

    claves = ("cantidad", "volumen", "premiosPagados", "ggr", "usuariosActivos")
    assert cuerpo["apuestas"] == dict(zip(claves, apuestas, strict=True))
    assert cuerpo["depositos"]["monto"] == depositos  # type: ignore[index]
    assert cuerpo["retiros"]["monto"] == retiros  # type: ignore[index]


def test_serie_diaria_con_un_elemento_por_dia(cliente: TestClient) -> None:
    respuesta = cliente.get("/reportes/serie-diaria", params=RANGO)

    assert respuesta.status_code == 200
    assert respuesta.json()["dias"] == [
        {
            "fecha": "2026-12-01",
            "volumen": "30.00",
            "premiosPagados": "25.50",
            "ggr": "4.50",
            "apuestas": 2,
            "depositos": "100.00",
            "retiros": "0.00",
        },
        {
            "fecha": "2026-12-02",
            "volumen": "17.25",
            "premiosPagados": "0.00",
            "ggr": "12.00",
            "apuestas": 2,
            "depositos": "0.00",
            "retiros": "40.00",
        },
        {
            "fecha": "2026-12-03",
            "volumen": "7.75",
            "premiosPagados": "15.50",
            "ggr": "-7.75",
            "apuestas": 1,
            "depositos": "50.50",
            "retiros": "0.00",
        },
    ]


def test_serie_de_un_rango_sin_datos_trae_todos_los_dias_en_cero(cliente: TestClient) -> None:
    respuesta = cliente.get(
        "/reportes/serie-diaria", params={"desde": "2027-02-01", "hasta": "2027-02-28"}
    )

    dias = respuesta.json()["dias"]
    assert len(dias) == 28
    assert {dia["volumen"] for dia in dias} == {"0.00"}


def _desglose(cliente: TestClient, **filtros: str) -> list[dict[str, object]]:
    respuesta = cliente.get("/reportes/competiciones", params={**RANGO, **filtros})
    assert respuesta.status_code == 200, respuesta.text
    competiciones: list[dict[str, object]] = respuesta.json()["competiciones"]
    return competiciones


def _competicion(id_: str, nombre: str, deporte: str, volumen: str, ggr: str) -> dict[str, object]:
    return {
        "competicionId": id_,
        "nombre": nombre,
        "deporte": deporte,
        "apuestas": 2,
        "volumen": volumen,
        "ggr": ggr,
    }


SERIE_A = _competicion(C2, "Serie A", "futbol", "32.00", "32.00")
LIGAPRO = _competicion(C1, "LigaPro", "futbol", "30.00", "4.50")
NBA = _competicion(C3, "NBA", "baloncesto", "13.00", "-7.75")


def test_desglose_por_competicion_ordenado_por_volumen(cliente: TestClient) -> None:
    # La combinada A2 (LigaPro y Serie A) cuenta en las dos competiciones.
    assert _desglose(cliente) == [SERIE_A, LIGAPRO, NBA]


def test_desglose_respeta_los_filtros_de_deporte_y_competicion(cliente: TestClient) -> None:
    assert _desglose(cliente, deporte="futbol") == [SERIE_A, LIGAPRO]
    assert _desglose(cliente, competicionId=C1) == [LIGAPRO]


def test_un_correo_desconocido_deja_la_serie_y_el_desglose_en_cero(cliente: TestClient) -> None:
    serie = cliente.get(
        "/reportes/serie-diaria", params={**RANGO, "usuario": "nadie@example.com"}
    ).json()

    assert [dia["apuestas"] for dia in serie["dias"]] == [0, 0, 0]
    assert {dia["depositos"] for dia in serie["dias"]} == {"0.00"}
    assert _desglose(cliente, usuario="nadie@example.com") == []


def test_exportar_coincide_con_el_resumen_y_la_serie(cliente: TestClient) -> None:
    csv = cliente.get("/reportes/exportar", params={**RANGO, "formato": "csv"})
    pdf = cliente.get("/reportes/exportar", params={**RANGO, "formato": "pdf"})

    assert csv.status_code == pdf.status_code == 200
    texto = csv.content.decode("utf-8-sig")
    assert "Volumen apostado,55.00" in texto
    assert "GGR,8.75" in texto
    assert "2026-12-02,2,17.25,0.00,12.00,0.00,40.00" in texto
    assert "Serie A,futbol,2,32.00,32.00" in texto
    assert pdf.content.startswith(b"%PDF")


def test_exportar_con_un_correo_desconocido_da_ceros(cliente: TestClient) -> None:
    respuesta = cliente.get(
        "/reportes/exportar", params={**RANGO, "formato": "csv", "usuario": "nadie@example.com"}
    )

    assert respuesta.status_code == 200
    assert "Volumen apostado,0.00" in respuesta.content.decode("utf-8-sig")


@pytest.mark.parametrize(
    ("ruta", "estado"),
    [
        ("/reportes/resumen", 503),
        ("/reportes/serie-diaria", 503),
        ("/reportes/exportar?formato=csv", 503),
        ("/reportes/competiciones", 200),
    ],
)
def test_una_tabla_faltante_responde_503_solo_donde_se_usa(
    urls: _Urls,
    esquemas: dict[str, str],
    clave_privada: ed25519.Ed25519PrivateKey,
    ruta: str,
    estado: int,
) -> None:
    cliente = _cliente(urls, esquemas["sin_retiro"], clave_privada)

    respuesta = cliente.get(_con_rango(ruta))

    assert respuesta.status_code == estado
    if estado == 503:
        assert respuesta.json()["detail"]["codigo"] == "DATOS_NO_DISPONIBLES"


@pytest.mark.parametrize(
    "ruta",
    [
        "/reportes/resumen",
        "/reportes/resumen?usuario=ana@example.com",
        "/reportes/resumen?deporte=futbol",
        "/reportes/serie-diaria",
        "/reportes/competiciones",
        "/reportes/exportar?formato=pdf",
    ],
)
def test_sin_las_tablas_de_otros_specs_responde_503(
    urls: _Urls, esquemas: dict[str, str], clave_privada: ed25519.Ed25519PrivateKey, ruta: str
) -> None:
    cliente = _cliente(urls, esquemas["vacio"], clave_privada)

    respuesta = cliente.get(_con_rango(ruta))

    assert respuesta.status_code == 503
    assert respuesta.json()["detail"]["codigo"] == "DATOS_NO_DISPONIBLES"


def _huella(propietario: Conexion, esquema: str) -> dict[str, object]:
    huellas: dict[str, object] = {}
    for tabla in TABLAS:
        consulta = sql.SQL(
            "SELECT count(*), md5(string_agg(t::text, ',' ORDER BY t::text)) FROM {} t"
        )
        fila = propietario.execute(consulta.format(sql.Identifier(esquema, tabla))).fetchone()
        huellas[tabla] = fila
    return huellas


def test_ninguna_ruta_escribe_en_la_base(
    cliente: TestClient, propietario: Conexion, esquemas: dict[str, str]
) -> None:
    antes = _huella(propietario, esquemas["completo"])

    for ruta in ["resumen", "serie-diaria", "competiciones", "exportar?formato=csv"]:
        assert cliente.get(_con_rango(f"/reportes/{ruta}")).status_code == 200

    assert _huella(propietario, esquemas["completo"]) == antes


def test_la_conexion_de_reportes_es_de_solo_lectura(cliente: TestClient) -> None:
    conexion = cliente.app.state.fabrica_conexiones()  # type: ignore[attr-defined]

    with conexion:
        assert conexion.execute("SELECT current_user").fetchone() == ("reportes_lectura",)
        assert conexion.execute("SHOW transaction_read_only").fetchone() == ("on",)
        with pytest.raises(psycopg.errors.ReadOnlySqlTransaction):
            conexion.execute("INSERT INTO usuario (id, email) VALUES (gen_random_uuid(), 'x@y')")


@pytest.fixture(scope="module")
def esquema_volumen(propietario: Conexion) -> Iterator[str]:
    esquema = _crear_esquema(propietario, "volumen")
    try:
        crear_tablas(propietario, omitir=set())
        cargar_volumen(propietario)
        _dar_lectura(propietario, esquema)
        yield esquema
    finally:
        _borrar_esquemas(propietario, [esquema])


@pytest.mark.parametrize("filtros", [{}, {"deporte": "futbol"}], ids=["sin-filtro", "deporte"])
def test_resumen_de_31_dias_con_100_000_apuestas_en_menos_de_3_s(
    urls: _Urls,
    esquema_volumen: str,
    clave_privada: ed25519.Ed25519PrivateKey,
    filtros: dict[str, str],
) -> None:
    cliente = _cliente(urls, esquema_volumen, clave_privada)
    inicio = time.perf_counter()

    respuesta = cliente.get(
        "/reportes/resumen", params={"desde": "2026-12-01", "hasta": "2026-12-31", **filtros}
    )

    duracion = time.perf_counter() - inicio
    assert respuesta.status_code == 200
    assert duracion < 3, f"{duracion:.2f} s"
    if not filtros:
        # 100 000 apuestas: 25 000 de cada estado; las anuladas no cuentan.
        apuestas = respuesta.json()["apuestas"]
        assert apuestas["cantidad"] == 75_000
        assert Decimal(apuestas["volumen"]) == Decimal("750000.00")
        assert Decimal(apuestas["ggr"]) == Decimal("500000.00") - Decimal("462500.00")
