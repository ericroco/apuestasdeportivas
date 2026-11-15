import { isIP } from 'node:net';
import type { NextRequest } from 'next/server';
import { leerEntornoServidor } from '@/lib/entorno';

/**
 * Proxy de la API (research §1). El navegador llama a `/api/*` de la propia web y este route handler reenvía la
 * petición a `API_URL` desde el servidor: así las cookies de sesión son del dominio de la web y `SameSite=Lax`
 * funciona aunque la API esté en otro sitio (Render). Agrega la IP y el dispositivo reales del navegador con el
 * secreto compartido, que la API exige para creerlos.
 */

/** Cabeceras del navegador que no se reenvían: las de transporte y las que solo puede poner este proxy. */
const NO_REENVIAR = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'x-proxy-secreto',
  'x-cliente-ip',
  'x-cliente-dispositivo',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
]);
const NO_DEVOLVER = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);
const SIN_CUERPO = new Set(['GET', 'HEAD']);

function ipDelNavegador(solicitud: NextRequest): string | null {
  const candidata =
    solicitud.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    solicitud.headers.get('x-real-ip')?.trim();
  return candidata && isIP(candidata) ? candidata : null;
}

async function reenviar(
  solicitud: NextRequest,
  { params }: { params: Promise<{ ruta: string[] }> },
): Promise<Response> {
  const entorno = leerEntornoServidor();
  const metodo = solicitud.method.toUpperCase();

  // CSRF (research §1): además de SameSite=Lax, solo se aceptan escrituras desde la propia web.
  if (!SIN_CUERPO.has(metodo) && solicitud.headers.get('origin') !== solicitud.nextUrl.origin) {
    return Response.json(
      { statusCode: 403, error: 'Forbidden', message: 'Origen no permitido.' },
      { status: 403 },
    );
  }

  const { ruta } = await params;
  const destino = `${entorno.API_URL}/api/${ruta.map(encodeURIComponent).join('/')}${solicitud.nextUrl.search}`;

  const cabeceras = new Headers();
  solicitud.headers.forEach((valor, nombre) => {
    if (!NO_REENVIAR.has(nombre.toLowerCase())) cabeceras.set(nombre, valor);
  });
  cabeceras.set('x-proxy-secreto', entorno.WEB_PROXY_SECRETO);
  const ip = ipDelNavegador(solicitud);
  if (ip) cabeceras.set('x-cliente-ip', ip);
  cabeceras.set('x-cliente-dispositivo', solicitud.headers.get('user-agent') ?? '');

  let respuesta: Response;
  try {
    respuesta = await fetch(destino, {
      method: metodo,
      headers: cabeceras,
      body: SIN_CUERPO.has(metodo) ? undefined : await solicitud.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json(
      {
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'No pudimos comunicarnos con el servidor. Inténtalo en unos segundos.',
      },
      { status: 502 },
    );
  }

  const salida = new Headers();
  respuesta.headers.forEach((valor, nombre) => {
    if (nombre !== 'set-cookie' && !NO_DEVOLVER.has(nombre)) salida.set(nombre, valor);
  });
  for (const cookie of respuesta.headers.getSetCookie()) salida.append('set-cookie', cookie);
  return new Response(respuesta.body, { status: respuesta.status, headers: salida });
}

export {
  reenviar as DELETE,
  reenviar as GET,
  reenviar as PATCH,
  reenviar as POST,
  reenviar as PUT,
};
