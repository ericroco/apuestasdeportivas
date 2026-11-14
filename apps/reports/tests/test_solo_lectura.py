"""El usuario de reportes no puede escribir (constitución, principio VI; spec 1, SC-006).

Prueba de integración: requiere PostgreSQL con el usuario reportes_lectura (docker compose en local,
servicio del job en CI) y las variables REPORTS_DATABASE_URL y PRUEBAS_DATABASE_URL_PROPIETARIO.
"""

from collections.abc import Iterator

import psycopg
import pytest
from psycopg import sql
from pydantic_settings import BaseSettings, SettingsConfigDict

pytestmark = pytest.mark.integracion

TABLA = sql.Identifier("prueba_solo_lectura")
Conexion = psycopg.Connection[tuple[object, ...]]


class _UrlsDePrueba(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    reports_database_url: str
    pruebas_database_url_propietario: str


@pytest.fixture(scope="module")
def urls() -> _UrlsDePrueba:
    return _UrlsDePrueba()


@pytest.fixture(scope="module")
def tabla_del_propietario(urls: _UrlsDePrueba) -> Iterator[None]:
    with psycopg.connect(urls.pruebas_database_url_propietario, autocommit=True) as conexion:
        conexion.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(TABLA))
        conexion.execute(sql.SQL("CREATE TABLE {} (id int PRIMARY KEY)").format(TABLA))
        conexion.execute(sql.SQL("INSERT INTO {} VALUES (1)").format(TABLA))
        yield
        conexion.execute(sql.SQL("DROP TABLE {}").format(TABLA))


@pytest.fixture
def lectura(urls: _UrlsDePrueba, tabla_del_propietario: None) -> Iterator[Conexion]:
    with psycopg.connect(urls.reports_database_url, autocommit=True) as conexion:
        yield conexion


def test_puede_leer_las_tablas_creadas_por_la_api(lectura: Conexion) -> None:
    fila = lectura.execute(sql.SQL("SELECT id FROM {}").format(TABLA)).fetchone()

    assert fila == (1,)


@pytest.mark.parametrize(
    "sentencia",
    [
        sql.SQL("INSERT INTO {} VALUES (2)").format(TABLA),
        sql.SQL("UPDATE {} SET id = 3").format(TABLA),
        sql.SQL("DELETE FROM {}").format(TABLA),
        sql.SQL("CREATE TABLE intruso (id int)"),
    ],
    ids=["insert", "update", "delete", "create"],
)
def test_no_puede_escribir(lectura: Conexion, sentencia: sql.Composed | sql.SQL) -> None:
    with pytest.raises(psycopg.Error):
        lectura.execute(sentencia)


def test_no_puede_escribir_aunque_desactive_el_modo_solo_lectura(lectura: Conexion) -> None:
    lectura.execute("SET default_transaction_read_only = off")

    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        lectura.execute(sql.SQL("INSERT INTO {} VALUES (4)").format(TABLA))
