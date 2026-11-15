import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { ErrorNegocio } from './error-negocio.js';
import { ErrorNegocioFilter } from './error-negocio.filter.js';
import { crearErrorDeValidacion } from './validacion.js';

function crearHost() {
  const respuesta = { status: vi.fn(), json: vi.fn() };
  respuesta.status.mockReturnValue(respuesta);
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => respuesta }),
  } as unknown as ArgumentsHost;
  return { host, respuesta };
}

describe('ErrorNegocioFilter', () => {
  it('responde con el formato uniforme { statusCode, error, codigo, message }', () => {
    const { host, respuesta } = crearHost();
    const error = new ErrorNegocio(
      'CUPON_CON_CANJES',
      HttpStatus.CONFLICT,
      'El cupón ya tiene canjes.',
    );

    new ErrorNegocioFilter().catch(error, host);

    expect(respuesta.status).toHaveBeenCalledWith(409);
    expect(respuesta.json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'Conflict',
      codigo: 'CUPON_CON_CANJES',
      message: 'El cupón ya tiene canjes.',
    });
  });

  it('agrega los datos del error sin dejar que pisen los campos fijos', () => {
    const { host, respuesta } = crearHost();
    const error = new ErrorNegocio(
      'SALDO_INSUFICIENTE',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Sin saldo.',
      {
        saldoDisponible: '3.00',
        statusCode: 200,
        codigo: 'OTRO',
      },
    );

    new ErrorNegocioFilter().catch(error, host);

    expect(respuesta.json).toHaveBeenCalledWith({
      saldoDisponible: '3.00',
      statusCode: 422,
      error: 'Unprocessable Entity',
      codigo: 'SALDO_INSUFICIENTE',
      message: 'Sin saldo.',
    });
  });

  it('usa el nombre del estado HTTP para 503', () => {
    const { host, respuesta } = crearHost();

    new ErrorNegocioFilter().catch(
      new ErrorNegocio(
        'DEPENDENCIA_NO_DISPONIBLE',
        HttpStatus.SERVICE_UNAVAILABLE,
        'No disponible.',
      ),
      host,
    );

    expect(respuesta.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503, error: 'Service Unavailable' }),
    );
  });
});

describe('crearErrorDeValidacion', () => {
  it('devuelve DATOS_INVALIDOS (400) nombrando cada campo con problemas', () => {
    const error = crearErrorDeValidacion([
      { message: 'debe estar entre 1 y 200', path: ['porcentaje'] },
      { message: 'requerido', path: [{ key: 'vigencia' }, 'terminaEn'] },
      { message: 'objeto inválido' },
    ]);

    expect(error).toBeInstanceOf(ErrorNegocio);
    expect(error.codigo).toBe('DATOS_INVALIDOS');
    expect(error.estadoHttp).toBe(HttpStatus.BAD_REQUEST);
    expect(error.message).toBe(
      'porcentaje: debe estar entre 1 y 200; vigencia.terminaEn: requerido; objeto inválido',
    );
  });

  it('limita la cantidad de problemas incluidos en el mensaje', () => {
    const problemas = Array.from({ length: 30 }, (_, i) => ({
      message: 'inválido',
      path: [`campo${i}`],
    }));

    const error = crearErrorDeValidacion(problemas);

    expect(error.message.split('; ')).toHaveLength(11);
    expect(error.message).toMatch(/y 20 problemas más$/);
  });
});
