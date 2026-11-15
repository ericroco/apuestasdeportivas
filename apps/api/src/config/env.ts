import { z } from 'zod';

/** Token de inyección del entorno ya validado. */
export const ENTORNO = Symbol('ENTORNO');

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
  const resultado = esquemaEntorno.safeParse(fuente);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `${problema.path.join('.')}: ${problema.message}`)
      .join('; ');
    throw new ErrorConfiguracion(`Configuración inválida de apps/api. ${detalle}`);
  }
  return Object.freeze(resultado.data);
}
