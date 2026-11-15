"""Validación del token de acceso de la API (contrato 6) y dependencia de administrador.

Reportes solo verifica: conoce la clave pública y una lista explícita de un algoritmo asimétrico,
así que no acepta `none` ni HMAC (la confusión HS/RS firmaría con la clave pública). La validación
ocurre antes de abrir cualquier conexión a la base.
"""

from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import HTTPException, Request, status

from reports.config import AlgoritmoJwt, ClavePublica, Configuracion, cargar_clave_publica

COOKIE_ACCESO = "acceso"
ROL_ADMINISTRADOR = "ADMINISTRADOR"
CLAIMS_OBLIGATORIOS = ["exp", "iss", "aud", "sub"]

MENSAJE_NO_AUTENTICADO = "Inicia sesión como administrador: el token falta, venció o no es válido."
MENSAJE_SIN_PERMISO = "Necesitas el rol de administrador para ver los reportes."


class TokenInvalido(Exception):
    """El token no se puede aceptar. Nunca se informa el motivo exacto al cliente."""


@dataclass(frozen=True)
class Administrador:
    id: str
    email: str | None


@dataclass(frozen=True)
class Sesion:
    """Claims verificados que reportes usa."""

    id: str
    email: str | None
    roles: tuple[str, ...]


class VerificadorToken:
    def __init__(
        self, clave: ClavePublica, algoritmo: AlgoritmoJwt, emisor: str, audiencia: str
    ) -> None:
        self._clave = clave
        self._algoritmo = algoritmo
        self._emisor = emisor
        self._audiencia = audiencia

    @classmethod
    def desde_configuracion(cls, config: Configuracion) -> "VerificadorToken":
        clave = cargar_clave_publica(config.jwt_public_key, config.jwt_algorithm)
        return cls(clave, config.jwt_algorithm, config.jwt_issuer, config.jwt_audience)

    def verificar(self, token: str) -> Sesion:
        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                self._clave,
                algorithms=[self._algoritmo],
                audience=self._audiencia,
                issuer=self._emisor,
                options={"require": CLAIMS_OBLIGATORIOS},
            )
        except jwt.PyJWTError as error:
            raise TokenInvalido from error
        return _sesion_desde_claims(claims)


def _sesion_desde_claims(claims: dict[str, Any]) -> Sesion:
    sub = claims.get("sub")
    roles = claims.get("roles")
    email = claims.get("email")
    if not isinstance(sub, str) or not sub:
        raise TokenInvalido
    if not isinstance(roles, list) or not all(isinstance(rol, str) for rol in roles):
        raise TokenInvalido
    return Sesion(id=sub, email=email if isinstance(email, str) else None, roles=tuple(roles))


def extraer_token(request: Request) -> str | None:
    """`Authorization: Bearer` (servidor a servidor) prevalece sobre la cookie `acceso`."""
    cabecera = request.headers.get("authorization")
    if cabecera:
        esquema, _, valor = cabecera.partition(" ")
        if esquema.lower() == "bearer":
            return valor.strip()
    return request.cookies.get(COOKIE_ACCESO) or None


def _no_autenticado() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"codigo": "TOKEN_INVALIDO", "mensaje": MENSAJE_NO_AUTENTICADO},
        headers={"WWW-Authenticate": "Bearer"},
    )


def requerir_administrador(request: Request) -> Administrador:
    """Dependencia de FastAPI: 401 sin token válido, 403 sin el rol ADMINISTRADOR."""
    verificador: VerificadorToken = request.app.state.verificador
    token = extraer_token(request)
    if not token:
        raise _no_autenticado()
    try:
        sesion = verificador.verificar(token)
    except TokenInvalido:
        raise _no_autenticado() from None
    if ROL_ADMINISTRADOR not in sesion.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"codigo": "SIN_PERMISO", "mensaje": MENSAJE_SIN_PERMISO},
        )
    return Administrador(id=sesion.id, email=sesion.email)
