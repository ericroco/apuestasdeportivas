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
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('convierte a número los valores numéricos que llegan como texto', () => {
    const entorno = validarEntorno({ ...ENTORNO_MINIMO, PORT: '4000', THROTTLE_LIMIT: '5' });

    expect(entorno.PORT).toBe(4000);
    expect(entorno.THROTTLE_LIMIT).toBe(5);
  });

  it('normaliza WEB_ORIGIN al origen (sin barra final ni ruta) para que CORS coincida', () => {
    const entorno = validarEntorno({
      ...ENTORNO_MINIMO,
      WEB_ORIGIN: 'https://web.example.app/inicio/',
    });

    expect(entorno.WEB_ORIGIN).toBe('https://web.example.app');
  });

  it('rechaza un TRUST_PROXY_HOPS negativo', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, TRUST_PROXY_HOPS: '-1' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
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

describe('validarEntorno: cupones y fraude (Spec 4)', () => {
  it('aplica los valores por defecto de contracts/configuracion.md', () => {
    const entorno = validarEntorno(ENTORNO_MINIMO);

    expect(entorno).toMatchObject({
      CUPON_ROLLOVER_MULTIPLICADOR: 5,
      CUPON_ROLLOVER_CUOTA_MINIMA: '1.50',
      BONO_VIGENCIA_DIAS: 30,
      FRAUDE_IP_MAX_CUENTAS: 3,
      FRAUDE_IP_VENTANA_HORAS: 24,
      FRAUDE_APUESTA_FACTOR: 10,
      FRAUDE_APUESTA_HISTORIAL_MIN: 5,
      FRAUDE_RAFAGA_MAX_APUESTAS: 10,
      FRAUDE_RAFAGA_VENTANA_SEG: 60,
      FRAUDE_RETIRO_VENTANA_HORAS: 24,
      FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT: 50,
    });
  });

  it('acepta valores dentro de rango que llegan como texto', () => {
    const entorno = validarEntorno({
      ...ENTORNO_MINIMO,
      CUPON_ROLLOVER_MULTIPLICADOR: '10',
      CUPON_ROLLOVER_CUOTA_MINIMA: '2.5',
      FRAUDE_RAFAGA_VENTANA_SEG: '120',
    });

    expect(entorno.CUPON_ROLLOVER_MULTIPLICADOR).toBe(10);
    expect(entorno.CUPON_ROLLOVER_CUOTA_MINIMA).toBe('2.50');
    expect(entorno.FRAUDE_RAFAGA_VENTANA_SEG).toBe(120);
  });

  it.each([
    ['CUPON_ROLLOVER_MULTIPLICADOR', '0'],
    ['CUPON_ROLLOVER_MULTIPLICADOR', '51'],
    ['CUPON_ROLLOVER_MULTIPLICADOR', '2.5'],
    ['BONO_VIGENCIA_DIAS', '366'],
    ['FRAUDE_IP_MAX_CUENTAS', '0'],
    ['FRAUDE_IP_VENTANA_HORAS', '721'],
    ['FRAUDE_APUESTA_FACTOR', '1'],
    ['FRAUDE_APUESTA_HISTORIAL_MIN', '1001'],
    ['FRAUDE_RAFAGA_MAX_APUESTAS', '1'],
    ['FRAUDE_RAFAGA_VENTANA_SEG', '4'],
    ['FRAUDE_RETIRO_VENTANA_HORAS', '0'],
    ['FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT', '1001'],
  ])('rechaza %s fuera de rango (%s)', (variable, valor) => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, [variable]: valor })).toThrow(
      new RegExp(variable),
    );
  });

  it.each(['1.00', '10.01', 'abc', '1.505', '-2'])(
    'rechaza una cuota mínima de rollover inválida (%s)',
    (valor) => {
      expect(() =>
        validarEntorno({ ...ENTORNO_MINIMO, CUPON_ROLLOVER_CUOTA_MINIMA: valor }),
      ).toThrow(/CUPON_ROLLOVER_CUOTA_MINIMA/);
    },
  );

  it('acepta los extremos del rango de la cuota mínima', () => {
    expect(
      validarEntorno({ ...ENTORNO_MINIMO, CUPON_ROLLOVER_CUOTA_MINIMA: '1.01' })
        .CUPON_ROLLOVER_CUOTA_MINIMA,
    ).toBe('1.01');
    expect(
      validarEntorno({ ...ENTORNO_MINIMO, CUPON_ROLLOVER_CUOTA_MINIMA: '10' })
        .CUPON_ROLLOVER_CUOTA_MINIMA,
    ).toBe('10.00');
  });
});
