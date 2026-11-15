import type { ArgumentsHost } from '@nestjs/common';
import { ErrorNegocio } from './error-negocio.js';
import { ErrorNegocioFilter } from './error-negocio.filter.js';

function crearHost() {
  const respuesta = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => respuesta }),
  } as unknown as ArgumentsHost;
  return { host, respuesta };
}

describe('ErrorNegocio', () => {
  it('usa el estado HTTP por defecto de su código', () => {
    expect(new ErrorNegocio('CUOTA_CAMBIADA', 'La cuota cambió').estadoHttp).toBe(409);
    expect(new ErrorNegocio('SALDO_INSUFICIENTE', 'Sin saldo').estadoHttp).toBe(422);
    expect(new ErrorNegocio('ROL_NO_PUEDE_APOSTAR', 'No puede').estadoHttp).toBe(403);
  });

  it('congela los datos para que nadie los altere después de lanzarlo', () => {
    const error = new ErrorNegocio('LIMITE_EXCEDIDO', 'Límite', { limite: 'MONTO_MAX' });

    expect(Object.isFrozen(error.datos)).toBe(true);
  });
});

describe('ErrorNegocioFilter', () => {
  it('responde con el formato uniforme más el código y los datos del error', () => {
    const { host, respuesta } = crearHost();
    const error = new ErrorNegocio('CUOTA_CAMBIADA', 'La cuota cambió; reconfirma', {
      cuotasVigentes: [{ seleccionId: 's1', cuota: '2.10' }],
    });

    new ErrorNegocioFilter().catch(error, host);

    expect(respuesta.status).toHaveBeenCalledWith(409);
    expect(respuesta.json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'Conflict',
      codigo: 'CUOTA_CAMBIADA',
      message: 'La cuota cambió; reconfirma',
      cuotasVigentes: [{ seleccionId: 's1', cuota: '2.10' }],
    });
  });

  it('no deja que los datos sobrescriban los campos del formato', () => {
    const { host, respuesta } = crearHost();
    const error = new ErrorNegocio('MERCADO_CERRADO', 'Mercado cerrado', {
      statusCode: 200,
      codigo: 'OTRO',
    });

    new ErrorNegocioFilter().catch(error, host);

    expect(respuesta.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422, codigo: 'MERCADO_CERRADO' }),
    );
  });
});
