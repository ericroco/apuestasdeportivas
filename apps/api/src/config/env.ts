import { z } from 'zod';

/** Token de inyección del entorno ya validado. */
export const ENTORNO = Symbol('ENTORNO');

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
