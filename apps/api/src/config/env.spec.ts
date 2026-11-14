import { ErrorConfiguracion, validarEntorno } from './env.js';

const ENTORNO_MINIMO = {
  DATABASE_URL: 'postgresql://apuestas:secreto-local@localhost:5432/apuestas',
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('validarEntorno', () => {
  it('aplica los valores por defecto cuando solo vienen las variables obligatorias', () => {
    const entorno = validarEntorno(ENTORNO_MINIMO);

    expect(entorno).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      THROTTLE_LIMIT: 100,
      THROTTLE_TTL_MS: 60_000,
    });
  });

  it('convierte a número los valores numéricos que llegan como texto', () => {
    const entorno = validarEntorno({ ...ENTORNO_MINIMO, PORT: '4000', THROTTLE_LIMIT: '5' });

    expect(entorno.PORT).toBe(4000);
    expect(entorno.THROTTLE_LIMIT).toBe(5);
  });

  it('nombra la variable obligatoria que falta', () => {
    const { DATABASE_URL: _omitida, ...sinBaseDeDatos } = ENTORNO_MINIMO;

    expect(() => validarEntorno(sinBaseDeDatos)).toThrow(ErrorConfiguracion);
    expect(() => validarEntorno(sinBaseDeDatos)).toThrow(/DATABASE_URL/);
  });

  it('rechaza una URL de Redis con un protocolo distinto de redis o rediss', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, REDIS_URL: 'http://localhost:6379' })).toThrow(
      /REDIS_URL/,
    );
  });

  it('rechaza un puerto que no es un entero positivo', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('no incluye valores secretos en el mensaje de error', () => {
    const conErrores = { ...ENTORNO_MINIMO, REDIS_URL: 'no-es-url', WEB_ORIGIN: 'tampoco' };

    expect(() => validarEntorno(conErrores)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('secreto-local') }),
    );
  });

  it('devuelve un objeto inmutable', () => {
    const entorno = validarEntorno(ENTORNO_MINIMO);

    expect(Object.isFrozen(entorno)).toBe(true);
  });
});
