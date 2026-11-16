import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { z } from 'zod';

/** Token de inyección del entorno ya validado. */
export const ENTORNO = Symbol('ENTORNO');

/** Secretos de prueba de Cloudflare Turnstile: aprueban o rechazan siempre, nunca en producción. */
const SECRETO_TURNSTILE_DE_PRUEBA = /^[123]x0{30,}AA$/;

/**
 * Clave PEM que puede llegar en una sola línea con `\n` escritos (GitHub Actions, panel de Render).
 * Los mensajes de error nunca incluyen el valor: es un secreto.
 */
function clavePem(tipo: 'privada' | 'publica') {
  return z
    .string({ error: 'es obligatoria' })
    .min(1, 'es obligatoria')
    .transform((valor) => valor.replaceAll(String.raw`\n`, '\n').trim() + '\n')
    .refine((pem) => {
      const clave = leerClave(pem, tipo);
      return clave?.asymmetricKeyType === 'ed25519';
    }, `debe ser una clave ${tipo} Ed25519 en formato PEM`);
}

function leerClave(pem: string, tipo: 'privada' | 'publica'): KeyObject | null {
  try {
    return tipo === 'privada' ? createPrivateKey(pem) : createPublicKey(pem);
  } catch {
    return null;
  }
}

/** Monto en texto decimal (`"100.00"`): se convierte a Decimal donde se usa, nunca a `number`. */
function montoTexto(porDefecto: string) {
  return z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'debe ser un monto como 100.00')
    .default(porDefecto);
}

/** Entero dentro de un rango, con valor por defecto (las variables llegan como texto). */
const enteroEnRango = (minimo: number, maximo: number, porDefecto: number) =>
  z.coerce.number().int().min(minimo).max(maximo).default(porDefecto);

/**
 * Cuota con hasta dos decimales entre 1.01 y 10, normalizada a texto con dos decimales ("2.5" → "2.50").
 * Se compara en centésimos enteros para no depender de la aritmética de punto flotante.
 */
const cuotaMinimaRollover = z
  .string()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, 'debe ser una cuota con hasta dos decimales')
  .transform((valor) => {
    const [entero = '0', decimales = ''] = valor.split('.');
    return Number(entero) * 100 + Number(decimales.padEnd(2, '0'));
  })
  .refine((centesimos) => centesimos >= 101 && centesimos <= 1_000, 'debe estar entre 1.01 y 10')
  .transform(
    (centesimos) => `${Math.trunc(centesimos / 100)}.${String(centesimos % 100).padStart(2, '0')}`,
  )
  .default('1.50');

/** Monto positivo con hasta dos decimales, normalizado a texto con exactamente dos ("1" → "1.00"). */
const montoPositivo = (porDefecto: string) =>
  z
    .string()
    .default(porDefecto)
    .refine((valor) => /^\d+(\.\d{1,2})?$/.test(valor) && aCentavos(valor) > 0n, {
      message: 'debe ser un monto positivo con hasta dos decimales',
      abort: true,
    })
    .transform((valor) => {
      const [entero = '0', decimales = ''] = valor.split('.');
      return `${BigInt(entero).toString()}.${decimales.padEnd(2, '0')}`;
    });

function aCentavos(monto: string): bigint {
  const [entero = '0', decimales = ''] = monto.split('.');
  return BigInt(entero) * 100n + BigInt(decimales.padEnd(2, '0') || '0');
}

/** Spec 3: `true`/`false` como texto; cualquier otro valor es un error. */
const booleanoTexto = z
  .enum(['true', 'false'], { message: 'debe ser true o false' })
  .transform((valor) => valor === 'true');

/** Spec 3: ids de ligas separados por comas; vacía o ausente = ninguna. */
const listaIdsLigas = z
  .string()
  .regex(/^\s*(\d+(\s*,\s*\d+)*)?\s*$/, 'debe ser una lista de ids numéricos separados por comas')
  .transform((valor) =>
    valor.trim() === '' ? [] : valor.split(',').map((id) => Number(id.trim())),
  )
  .default([]);

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // Se guarda solo el origen: CORS compara exacto con la cabecera Origin, que no lleva barra ni ruta.
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  // Proxies delante de la API en los que se confía para leer la IP real del cliente (Render: 1).
  // En 0 se ignora X-Forwarded-For, que en local cualquiera podría falsificar.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // Spec 2: token de acceso EdDSA (contrato 6). La privada solo vive en la API; la pública la usa reportes.
  JWT_PRIVATE_KEY: clavePem('privada'),
  JWT_PUBLIC_KEY: clavePem('publica'),
  JWT_ACCESS_TTL: z.coerce.number().int().min(60).max(900).default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().min(3600).default(604_800),
  COOKIE_SECURE: z.stringbool().default(true),
  // Spec 2: 32 bytes en base64 para cifrar los secretos del segundo factor (AES-256-GCM).
  TOTP_CLAVE_CIFRADO: z
    .string({ error: 'es obligatoria' })
    .refine((valor) => Buffer.from(valor, 'base64').length === 32, 'deben ser 32 bytes en base64'),
  TURNSTILE_SECRET: z.string({ error: 'es obligatoria' }).min(1, 'es obligatoria'),
  // Spec 2: secreto compartido con el proxy de la web para confiar en la IP real del cliente.
  WEB_PROXY_SECRETO: z
    .string({ error: 'es obligatoria' })
    .min(32, 'debe tener al menos 32 caracteres'),
  CORREO_TRANSPORTE: z.enum(['smtp', 'resend']).default('smtp'),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1025'),
  RESEND_API_KEY: z.string().min(1).optional(),
  CORREO_REMITENTE: z.string().min(3).default('Apuestas <no-responder@localhost>'),
  BLOQUEO_INTENTOS: z.coerce.number().int().positive().default(5),
  BLOQUEO_MINUTOS: z.coerce.number().int().positive().default(15),

  // Spec 2: Payphone (sandbox). Obligatorias solo en producción: en local y CI los depósitos usan una pasarela de
  // prueba y sin token la API responde que los pagos no están configurados.
  PAYPHONE_TOKEN: z.string().default(''),
  PAYPHONE_STORE_ID: z.string().default(''),
  PAYPHONE_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://pay.payphonetodoesposible.com')
    .transform((url) => url.replace(/\/+$/, '')),
  DEPOSITO_MIN: montoTexto('1.00'),
  DEPOSITO_MAX: montoTexto('1000.00'),
  // Spec 2: retiros (FR-055, FR-057). Sobre el umbral, revisión manual del administrador.
  RETIRO_MIN: montoTexto('5.00'),
  RETIRO_MAX: montoTexto('1000.00'),
  RETIRO_UMBRAL_REVISION: montoTexto('100.00'),

  // Spec 4: cupones y rollover (specs/004-promociones-fraude-reportes/contracts/configuracion.md).
  CUPON_ROLLOVER_MULTIPLICADOR: enteroEnRango(1, 50, 5),
  CUPON_ROLLOVER_CUOTA_MINIMA: cuotaMinimaRollover,
  BONO_VIGENCIA_DIAS: enteroEnRango(1, 365, 30),
  // Spec 4: umbrales de las reglas de fraude.
  FRAUDE_IP_MAX_CUENTAS: enteroEnRango(1, 100, 3),
  FRAUDE_IP_VENTANA_HORAS: enteroEnRango(1, 720, 24),
  FRAUDE_APUESTA_FACTOR: enteroEnRango(2, 1_000, 10),
  FRAUDE_APUESTA_HISTORIAL_MIN: enteroEnRango(1, 1_000, 5),
  FRAUDE_RAFAGA_MAX_APUESTAS: enteroEnRango(2, 1_000, 10),
  FRAUDE_RAFAGA_VENTANA_SEG: enteroEnRango(5, 3_600, 60),
  FRAUDE_RETIRO_VENTANA_HORAS: enteroEnRango(1, 720, 24),
  FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT: enteroEnRango(1, 1_000, 50),

  // Spec 3: proveedor de datos deportivos (specs/003-partidos-apuestas-liquidacion/contracts/configuracion.md).
  API_FOOTBALL_SIMULACION: booleanoTexto.default(true),
  // Secreto: solo en el backend; nunca llega al navegador ni al log. Vacía cuenta como ausente.
  API_FOOTBALL_KEY: z.preprocess(
    (valor) => (valor === '' ? undefined : valor),
    z.string().optional(),
  ),
  API_FOOTBALL_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://v3.football.api-sports.io'),
  API_FOOTBALL_PRESUPUESTO_DIARIO: z.coerce.number().int().positive().default(100),
  API_FOOTBALL_LIGAS: listaIdsLigas,
  // Spec 3: límites de apuestas y plazos.
  APUESTA_MONTO_MIN: montoPositivo('0.50'),
  APUESTA_MONTO_MAX: montoPositivo('500.00'),
  APUESTA_LIMITE_DIARIO_USUARIO: montoPositivo('1000.00'),
  APUESTA_GANANCIA_MAX: montoPositivo('5000.00'),
  APUESTA_MAX_SELECCIONES: z.coerce.number().int().min(2).default(10),
  APUESTA_RETARDO_VIVO_MS: z.coerce.number().int().min(0).default(5000),
  SUSPENSION_PLAZO_HORAS: z.coerce.number().positive().default(48),
});

/** Reglas que cruzan variables. Los mensajes nombran la variable, nunca su valor. */
const esquemaValidado = esquemaEntorno.superRefine((entorno, contexto) => {
  // Spec 3: sin simulación hacen falta la clave y las ligas; los límites de monto deben ser coherentes.
  if (!entorno.API_FOOTBALL_SIMULACION) {
    for (const variable of ['API_FOOTBALL_KEY', 'API_FOOTBALL_LIGAS'] as const) {
      const valor = entorno[variable];
      if (!valor || (Array.isArray(valor) && valor.length === 0)) {
        contexto.addIssue({
          code: 'custom',
          path: [variable],
          message: 'es obligatoria con API_FOOTBALL_SIMULACION=false',
        });
      }
    }
  }
  if (aCentavos(entorno.APUESTA_MONTO_MIN) > aCentavos(entorno.APUESTA_MONTO_MAX)) {
    contexto.addIssue({
      code: 'custom',
      path: ['APUESTA_MONTO_MIN'],
      message: 'no puede ser mayor que APUESTA_MONTO_MAX',
    });
  }
  if (aCentavos(entorno.APUESTA_MONTO_MAX) > aCentavos(entorno.APUESTA_LIMITE_DIARIO_USUARIO)) {
    contexto.addIssue({
      code: 'custom',
      path: ['APUESTA_MONTO_MAX'],
      message: 'no puede ser mayor que APUESTA_LIMITE_DIARIO_USUARIO',
    });
  }

  const derivada = leerClave(entorno.JWT_PRIVATE_KEY, 'privada');
  const publica = leerClave(entorno.JWT_PUBLIC_KEY, 'publica');
  if (derivada && publica) {
    const esperada = createPublicKey(derivada).export({ type: 'spki', format: 'der' });
    if (!esperada.equals(publica.export({ type: 'spki', format: 'der' }))) {
      contexto.addIssue({
        code: 'custom',
        path: ['JWT_PUBLIC_KEY'],
        message: 'no corresponde a JWT_PRIVATE_KEY',
      });
    }
  }

  if (entorno.CORREO_TRANSPORTE === 'resend' && !entorno.RESEND_API_KEY) {
    contexto.addIssue({
      code: 'custom',
      path: ['RESEND_API_KEY'],
      message: 'es obligatoria cuando CORREO_TRANSPORTE=resend',
    });
  }

  if (entorno.NODE_ENV === 'production') {
    if (SECRETO_TURNSTILE_DE_PRUEBA.test(entorno.TURNSTILE_SECRET)) {
      contexto.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SECRET'],
        message: 'no puede ser un secreto de prueba de Cloudflare en producción',
      });
    }
    for (const variable of ['PAYPHONE_TOKEN', 'PAYPHONE_STORE_ID'] as const) {
      if (!entorno[variable]) {
        contexto.addIssue({
          code: 'custom',
          path: [variable],
          message: 'es obligatoria en producción',
        });
      }
    }
    if (!entorno.COOKIE_SECURE) {
      contexto.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'debe ser true en producción',
      });
    }
  }
});

export type Entorno = Readonly<z.infer<typeof esquemaEntorno>>;

export class ErrorConfiguracion extends Error {
  override readonly name = 'ErrorConfiguracion';
}

/**
 * Valida las variables de entorno de la API. Si falta una obligatoria o es inválida, lanza
 * ErrorConfiguracion nombrando la variable, sin incluir su valor (puede ser un secreto).
 */
export function validarEntorno(fuente: Record<string, string | undefined>): Entorno {
  const resultado = esquemaValidado.safeParse(fuente);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `${problema.path.join('.')}: ${problema.message}`)
      .join('; ');
    throw new ErrorConfiguracion(`Configuración inválida de apps/api. ${detalle}`);
  }
  return Object.freeze(resultado.data);
}
