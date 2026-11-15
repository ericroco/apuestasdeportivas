import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import { RolesGuard } from './roles.guard.js';

class ControladorDePrueba {
  @Roles('OPERADOR', 'ADMINISTRADOR')
  gestionar(): void {}

  soloSesion(): void {}
}

@Roles('ADMINISTRADOR')
class ControladorDeAdministrador {
  revisar(): void {}
}

function contexto(clase: new () => object, metodo: string, usuario: unknown): ExecutionContext {
  const prototipo = clase.prototype as Record<string, () => void>;
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
    getHandler: () => prototipo[metodo],
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

const operador: UsuarioAutenticado = { id: 'u-1', email: 'op@example.com', roles: ['OPERADOR'] };
const apostador: UsuarioAutenticado = { id: 'u-2', email: 'a@example.com', roles: ['APOSTADOR'] };

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('rechaza con 401 si no hay usuario en la petición (falla cerrada sin el guard del Spec 2)', () => {
    expect(() => guard.canActivate(contexto(ControladorDePrueba, 'gestionar', undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza con 401 un usuario mal formado', () => {
    expect(() =>
      guard.canActivate(
        contexto(ControladorDePrueba, 'soloSesion', { id: 'u-1', roles: 'ADMINISTRADOR' }),
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(contexto(ControladorDePrueba, 'soloSesion', { id: '', roles: [] })),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza con 403 si el usuario no tiene ninguno de los roles requeridos', () => {
    expect(() => guard.canActivate(contexto(ControladorDePrueba, 'gestionar', apostador))).toThrow(
      ForbiddenException,
    );
  });

  it('deja pasar al usuario con alguno de los roles requeridos', () => {
    expect(guard.canActivate(contexto(ControladorDePrueba, 'gestionar', operador))).toBe(true);
  });

  it('aplica los roles declarados en la clase del controlador', () => {
    expect(() =>
      guard.canActivate(contexto(ControladorDeAdministrador, 'revisar', operador)),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        contexto(ControladorDeAdministrador, 'revisar', { ...operador, roles: ['ADMINISTRADOR'] }),
      ),
    ).toBe(true);
  });

  it('sin @Roles basta con estar autenticado', () => {
    expect(guard.canActivate(contexto(ControladorDePrueba, 'soloSesion', apostador))).toBe(true);
  });
});
