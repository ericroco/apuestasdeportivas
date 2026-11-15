/**
 * Variables del servidor de Next.js que agrega el Spec 2. Solo se leen en el servidor (proxy de `/api/*` y
 * componentes de servidor); `WEB_PROXY_SECRETO` nunca debe llegar al navegador. Los errores nombran la variable,
 * nunca su valor.
 */
export interface EntornoServidor {
  readonly API_URL: string;
  readonly WEB_PROXY_SECRETO: string;
  readonly NEXT_PUBLIC_TURNSTILE_SITE_KEY: string;
}

export class ErrorEntornoWeb extends Error {
  override readonly name = 'ErrorEntornoWeb';
}

export function leerEntornoServidor(
  fuente: Record<string, string | undefined> = process.env,
): EntornoServidor {
  const problemas: string[] = [];

  const apiUrl = (fuente.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(apiUrl)) problemas.push('API_URL: debe ser una URL http o https');

  const secreto = fuente.WEB_PROXY_SECRETO ?? '';
  if (secreto.length < 32) problemas.push('WEB_PROXY_SECRETO: debe tener al menos 32 caracteres');

  const claveSitio = fuente.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  if (!claveSitio) problemas.push('NEXT_PUBLIC_TURNSTILE_SITE_KEY: es obligatoria');

  if (problemas.length > 0) {
    throw new ErrorEntornoWeb(`Configuración inválida de apps/web. ${problemas.join('; ')}`);
  }

  return Object.freeze({
    API_URL: apiUrl,
    WEB_PROXY_SECRETO: secreto,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: claveSitio,
  });
}
