import { z } from 'zod';

/** Token de inyección del entorno ya validado. */
export const ENTORNO = Symbol('ENTORNO');

const PATRON_MONTO = /^\d+(\.\d{1,2})?$/;

/** Monto positivo con hasta dos decimales, normalizado a texto con exactamente dos ("1" → "1.00"). */
const montoPositivo = (porDefecto: string) =>
  z
    .string()
    .default(porDefecto)
    .refine((valor) => PATRON_MONTO.test(valor) && aCentavos(valor) > 0n, {
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

/** Una variable presente pero vacía (`CLAVE=` en el .env) cuenta como ausente. */
const opcional = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((valor) => (valor === '' ? undefined : valor), esquema.optional());

const booleanoTexto = z
  .enum(['true', 'false'], { message: 'debe ser true o false' })
  .transform((valor) => valor === 'true');

const listaIdsLigas = z
  .string()
  .regex(/^\s*\d+(\s*,\s*\d+)*\s*$/, 'debe ser una lista de ids numéricos separados por comas')
  .transform((valor) => valor.split(',').map((id) => Number(id.trim())));

const esquemaEntorno = z
  .object({
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

    // Spec 3: proveedor de datos deportivos (contracts/configuracion.md del spec 003).
    API_FOOTBALL_SIMULACION: booleanoTexto.default(true),
    // Secreto: solo en el backend; nunca llega al navegador ni al log.
    API_FOOTBALL_KEY: opcional(z.string()),
    API_FOOTBALL_BASE_URL: z
      .url({ protocol: /^https?$/ })
      .default('https://v3.football.api-sports.io'),
    API_FOOTBALL_PRESUPUESTO_DIARIO: z.coerce.number().int().positive().default(100),
    API_FOOTBALL_LIGAS: opcional(listaIdsLigas),

    // Spec 3: límites de apuestas y plazos.
    APUESTA_MONTO_MIN: montoPositivo('0.50'),
    APUESTA_MONTO_MAX: montoPositivo('500.00'),
    APUESTA_LIMITE_DIARIO_USUARIO: montoPositivo('1000.00'),
    APUESTA_GANANCIA_MAX: montoPositivo('5000.00'),
    APUESTA_MAX_SELECCIONES: z.coerce.number().int().min(2).default(10),
    APUESTA_RETARDO_VIVO_MS: z.coerce.number().int().min(0).default(5000),
    SUSPENSION_PLAZO_HORAS: z.coerce.number().positive().default(48),
  })
  .superRefine((entorno, contexto) => {
    if (!entorno.API_FOOTBALL_SIMULACION) {
      if (!entorno.API_FOOTBALL_KEY) {
        contexto.addIssue({
          code: 'custom',
          path: ['API_FOOTBALL_KEY'],
          message: 'es obligatoria con API_FOOTBALL_SIMULACION=false',
        });
      }
      if (!entorno.API_FOOTBALL_LIGAS?.length) {
        contexto.addIssue({
          code: 'custom',
          path: ['API_FOOTBALL_LIGAS'],
          message: 'es obligatoria con API_FOOTBALL_SIMULACION=false',
        });
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
  })
  .transform((entorno) => ({ ...entorno, API_FOOTBALL_LIGAS: entorno.API_FOOTBALL_LIGAS ?? [] }));

export type Entorno = Readonly<z.infer<typeof esquemaEntorno>>;

export class ErrorConfiguracion extends Error {
  override readonly name = 'ErrorConfiguracion';
}

/**
 * Valida las variables de entorno de la API. Si falta una obligatoria o es inválida, lanza
 * ErrorConfiguracion nombrando la variable, sin incluir su valor (puede ser un secreto).
 */
export function validarEntorno(fuente: Record<string, string | undefined>): Entorno {
  const resultado = esquemaEntorno.safeParse(fuente);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `${problema.path.join('.')}: ${problema.message}`)
      .join('; ');
    throw new ErrorConfiguracion(`Configuración inválida de apps/api. ${detalle}`);
  }
  return Object.freeze(resultado.data);
}
