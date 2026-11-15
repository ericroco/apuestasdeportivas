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

describe('validarEntorno: variables del Spec 3', () => {
  it('aplica los valores por defecto de partidos, apuestas y simulación', () => {
    const entorno = validarEntorno(ENTORNO_MINIMO);

    expect(entorno).toMatchObject({
      API_FOOTBALL_SIMULACION: true,
      API_FOOTBALL_BASE_URL: 'https://v3.football.api-sports.io',
      API_FOOTBALL_PRESUPUESTO_DIARIO: 100,
      API_FOOTBALL_LIGAS: [],
      APUESTA_MONTO_MIN: '0.50',
      APUESTA_MONTO_MAX: '500.00',
      APUESTA_LIMITE_DIARIO_USUARIO: '1000.00',
      APUESTA_GANANCIA_MAX: '5000.00',
      APUESTA_MAX_SELECCIONES: 10,
      APUESTA_RETARDO_VIVO_MS: 5000,
      SUSPENSION_PLAZO_HORAS: 48,
    });
    expect(entorno.API_FOOTBALL_KEY).toBeUndefined();
  });

  it('interpreta API_FOOTBALL_SIMULACION=false como booleano y no como texto verdadero', () => {
    const entorno = validarEntorno({
      ...ENTORNO_MINIMO,
      API_FOOTBALL_SIMULACION: 'false',
      API_FOOTBALL_KEY: 'clave-secreta-123',
      API_FOOTBALL_LIGAS: '39, 140',
    });

    expect(entorno.API_FOOTBALL_SIMULACION).toBe(false);
    expect(entorno.API_FOOTBALL_LIGAS).toEqual([39, 140]);
  });

  it('trata API_FOOTBALL_KEY y API_FOOTBALL_LIGAS vacías (como en .env.example) como ausentes', () => {
    const entorno = validarEntorno({
      ...ENTORNO_MINIMO,
      API_FOOTBALL_KEY: '',
      API_FOOTBALL_LIGAS: '',
    });

    expect(entorno.API_FOOTBALL_KEY).toBeUndefined();
    expect(entorno.API_FOOTBALL_LIGAS).toEqual([]);
  });

  it('rechaza un valor de API_FOOTBALL_SIMULACION que no sea true o false', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, API_FOOTBALL_SIMULACION: 'si' })).toThrow(
      /API_FOOTBALL_SIMULACION/,
    );
  });

  it('exige API_FOOTBALL_KEY y API_FOOTBALL_LIGAS cuando la simulación está apagada', () => {
    const sinSimulacion = { ...ENTORNO_MINIMO, API_FOOTBALL_SIMULACION: 'false' };

    expect(() => validarEntorno(sinSimulacion)).toThrow(/API_FOOTBALL_KEY/);
    expect(() => validarEntorno(sinSimulacion)).toThrow(/API_FOOTBALL_LIGAS/);
  });

  it('no muestra la clave del proveedor en el mensaje de error', () => {
    const conError = {
      ...ENTORNO_MINIMO,
      API_FOOTBALL_SIMULACION: 'false',
      API_FOOTBALL_KEY: 'clave-secreta-123',
      API_FOOTBALL_LIGAS: 'abc',
    };

    expect(() => validarEntorno(conError)).toThrow(/API_FOOTBALL_LIGAS/);
    expect(() => validarEntorno(conError)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('clave-secreta-123') }),
    );
  });

  it.each(['0', '-1.00', '10.505', 'diez'])('rechaza el monto %s en APUESTA_MONTO_MIN', (valor) => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, APUESTA_MONTO_MIN: valor })).toThrow(
      /APUESTA_MONTO_MIN/,
    );
  });

  it('normaliza los montos a dos decimales', () => {
    const entorno = validarEntorno({
      ...ENTORNO_MINIMO,
      APUESTA_MONTO_MIN: '1',
      APUESTA_MONTO_MAX: '20.5',
    });

    expect(entorno.APUESTA_MONTO_MIN).toBe('1.00');
    expect(entorno.APUESTA_MONTO_MAX).toBe('20.50');
  });

  it('exige APUESTA_MONTO_MIN ≤ APUESTA_MONTO_MAX', () => {
    expect(() =>
      validarEntorno({
        ...ENTORNO_MINIMO,
        APUESTA_MONTO_MIN: '600.00',
        APUESTA_MONTO_MAX: '500.00',
      }),
    ).toThrow(/APUESTA_MONTO_MIN/);
  });

  it('exige APUESTA_MONTO_MAX ≤ APUESTA_LIMITE_DIARIO_USUARIO', () => {
    expect(() =>
      validarEntorno({
        ...ENTORNO_MINIMO,
        APUESTA_MONTO_MAX: '2000.00',
        APUESTA_LIMITE_DIARIO_USUARIO: '1000.00',
      }),
    ).toThrow(/APUESTA_MONTO_MAX/);
  });

  it('exige al menos 2 selecciones como máximo de una combinada', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, APUESTA_MAX_SELECCIONES: '1' })).toThrow(
      /APUESTA_MAX_SELECCIONES/,
    );
  });

  it('acepta un plazo de suspensión fraccionario (pruebas) y rechaza uno no positivo', () => {
    const entorno = validarEntorno({ ...ENTORNO_MINIMO, SUSPENSION_PLAZO_HORAS: '0.001' });

    expect(entorno.SUSPENSION_PLAZO_HORAS).toBe(0.001);
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, SUSPENSION_PLAZO_HORAS: '0' })).toThrow(
      /SUSPENSION_PLAZO_HORAS/,
    );
  });
});
