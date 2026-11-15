import { HttpStatus } from '@nestjs/common';
import { DependenciaNoDisponibleError, requerir } from './dependencias.js';
import { ErrorNegocio } from './error-negocio.js';

describe('requerir', () => {
  it('devuelve el puerto cuando está disponible', () => {
    const puerto = { registrar: vi.fn() };

    expect(requerir(puerto, 'auditoría')).toBe(puerto);
  });

  it.each([undefined, null])(
    'lanza DependenciaNoDisponibleError (503) si el puerto es %s',
    (ausente) => {
      expect(() => requerir(ausente, 'billetera')).toThrow(DependenciaNoDisponibleError);
    },
  );

  it('el error tiene el código y el estado del contrato y nombra la dependencia', () => {
    const error = new DependenciaNoDisponibleError('billetera');

    expect(error).toBeInstanceOf(ErrorNegocio);
    expect(error.codigo).toBe('DEPENDENCIA_NO_DISPONIBLE');
    expect(error.estadoHttp).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error.message).toMatch(/billetera/);
  });
});
