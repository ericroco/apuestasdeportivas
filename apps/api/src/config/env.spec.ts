import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { ErrorConfiguracion, validarEntorno } from './env.js';

function parEd25519(): { privada: string; publica: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privada: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publica: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const CLAVES = parEd25519();
const OTRAS_CLAVES = parEd25519();
const SECRETO_TURNSTILE_PRUEBA = '1x0000000000000000000000000000000AA';

const ENTORNO_MINIMO = {
  DATABASE_URL: 'postgresql://apuestas:secreto-local@localhost:5432/apuestas',
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:3000',
  JWT_PRIVATE_KEY: CLAVES.privada,
  JWT_PUBLIC_KEY: CLAVES.publica,
  TOTP_CLAVE_CIFRADO: randomBytes(32).toString('base64'),
  TURNSTILE_SECRET: SECRETO_TURNSTILE_PRUEBA,
  WEB_PROXY_SECRETO: randomBytes(32).toString('base64url'),
};

/** Como llegan las claves PEM en una sola línea (GitHub Actions, panel de Render). */
const enUnaLinea = (pem: string): string => pem.replaceAll('\n', String.raw`\n`);

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

describe('validarEntorno: autenticación, correo y proxy (Spec 2)', () => {
  it('aplica los valores por defecto de sesión, bloqueo y correo', () => {
    const entorno = validarEntorno(ENTORNO_MINIMO);

    expect(entorno).toMatchObject({
      JWT_ACCESS_TTL: 900,
      JWT_REFRESH_TTL: 604_800,
      COOKIE_SECURE: true,
      CORREO_TRANSPORTE: 'smtp',
      SMTP_URL: 'smtp://localhost:1025',
      CORREO_REMITENTE: 'Apuestas <no-responder@localhost>',
      BLOQUEO_INTENTOS: 5,
      BLOQUEO_MINUTOS: 15,
    });
  });

  it.each([
    'JWT_PRIVATE_KEY',
    'JWT_PUBLIC_KEY',
    'TOTP_CLAVE_CIFRADO',
    'TURNSTILE_SECRET',
    'WEB_PROXY_SECRETO',
  ] as const)('exige %s', (variable) => {
    const { [variable]: _omitida, ...incompleto } = ENTORNO_MINIMO;

    expect(() => validarEntorno(incompleto)).toThrow(new RegExp(variable));
  });

  it('acepta las claves PEM escritas en una sola línea con \\n y las normaliza', () => {
    const entorno = validarEntorno({
      ...ENTORNO_MINIMO,
      JWT_PRIVATE_KEY: enUnaLinea(CLAVES.privada),
      JWT_PUBLIC_KEY: enUnaLinea(CLAVES.publica),
    });

    expect(entorno.JWT_PRIVATE_KEY).toBe(CLAVES.privada);
    expect(entorno.JWT_PUBLIC_KEY).toBe(CLAVES.publica);
  });

  it('rechaza una clave privada que no es Ed25519', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();

    expect(() => validarEntorno({ ...ENTORNO_MINIMO, JWT_PRIVATE_KEY: rsa })).toThrow(
      /JWT_PRIVATE_KEY/,
    );
  });

  it('rechaza una clave pública que no corresponde a la privada', () => {
    expect(() =>
      validarEntorno({ ...ENTORNO_MINIMO, JWT_PUBLIC_KEY: OTRAS_CLAVES.publica }),
    ).toThrow(/JWT_PUBLIC_KEY/);
  });

  it('no incluye el contenido de las claves en el mensaje de error', () => {
    expect(() =>
      validarEntorno({ ...ENTORNO_MINIMO, JWT_PUBLIC_KEY: OTRAS_CLAVES.publica }),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('BEGIN') }));
  });

  it('limita la vida del token de acceso a 15 minutos (contrato 6)', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, JWT_ACCESS_TTL: '901' })).toThrow(
      /JWT_ACCESS_TTL/,
    );
    expect(validarEntorno({ ...ENTORNO_MINIMO, JWT_ACCESS_TTL: '600' }).JWT_ACCESS_TTL).toBe(600);
  });

  it('exige que TOTP_CLAVE_CIFRADO sean 32 bytes en base64', () => {
    expect(() =>
      validarEntorno({
        ...ENTORNO_MINIMO,
        TOTP_CLAVE_CIFRADO: randomBytes(16).toString('base64'),
      }),
    ).toThrow(/TOTP_CLAVE_CIFRADO/);
  });

  it('exige un WEB_PROXY_SECRETO de al menos 32 caracteres', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, WEB_PROXY_SECRETO: 'corto' })).toThrow(
      /WEB_PROXY_SECRETO/,
    );
  });

  it('interpreta COOKIE_SECURE como booleano', () => {
    expect(validarEntorno({ ...ENTORNO_MINIMO, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
  });

  it('exige RESEND_API_KEY cuando el correo sale por Resend', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, CORREO_TRANSPORTE: 'resend' })).toThrow(
      /RESEND_API_KEY/,
    );
    expect(
      validarEntorno({ ...ENTORNO_MINIMO, CORREO_TRANSPORTE: 'resend', RESEND_API_KEY: 're_x' })
        .CORREO_TRANSPORTE,
    ).toBe('resend');
  });

  it('rechaza una SMTP_URL con otro protocolo', () => {
    expect(() => validarEntorno({ ...ENTORNO_MINIMO, SMTP_URL: 'http://localhost:1025' })).toThrow(
      /SMTP_URL/,
    );
  });

  describe('en producción', () => {
    const PRODUCCION = {
      ...ENTORNO_MINIMO,
      NODE_ENV: 'production',
      PAYPHONE_TOKEN: 'token-real',
      PAYPHONE_STORE_ID: 'tienda-real',
    };

    it('rechaza los secretos de prueba de Turnstile, que aprueban o rechazan siempre', () => {
      expect(() => validarEntorno(PRODUCCION)).toThrow(/TURNSTILE_SECRET/);
    });

    it('exige las credenciales de Payphone', () => {
      expect(() =>
        validarEntorno({
          ...PRODUCCION,
          TURNSTILE_SECRET: '0x4AAAAAAAsecretoReal',
          PAYPHONE_TOKEN: '',
        }),
      ).toThrow(/PAYPHONE_TOKEN/);
    });

    it('exige COOKIE_SECURE', () => {
      expect(() =>
        validarEntorno({
          ...PRODUCCION,
          TURNSTILE_SECRET: '0x4AAAAAAAsecretoReal',
          COOKIE_SECURE: 'false',
        }),
      ).toThrow(/COOKIE_SECURE/);
    });
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
