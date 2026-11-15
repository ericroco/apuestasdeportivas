// Utilidades HTTP de los servidores simulados del E2E del Spec 4 (sin dependencias).

/** Roles por token de prueba: el E2E pone uno de estos valores en la cookie `acceso`. */
export const ROLES_POR_TOKEN = {
  'token-apostador': ['APOSTADOR'],
  'token-operador': ['OPERADOR'],
  'token-admin': ['ADMINISTRADOR'],
};

/**
 * @param {import('node:http').ServerResponse} respuesta
 * @param {number} estado
 * @param {unknown} cuerpo
 */
export function enviarJson(respuesta, estado, cuerpo) {
  respuesta.writeHead(estado, { 'content-type': 'application/json' });
  respuesta.end(JSON.stringify(cuerpo));
}

/** @param {import('node:http').IncomingMessage} peticion */
export async function leerCuerpo(peticion) {
  const partes = [];
  for await (const parte of peticion) partes.push(parte);
  const texto = Buffer.concat(partes).toString('utf8');
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch {
    return {};
  }
}

/** @param {string | undefined} cabecera */
export function cookieAcceso(cabecera) {
  const par = (cabecera ?? '')
    .split(';')
    .map((trozo) => trozo.trim())
    .find((trozo) => trozo.startsWith('acceso='));
  return par?.slice('acceso='.length);
}

/** @param {string | undefined} cabecera */
export function tokenBearer(cabecera) {
  return cabecera?.startsWith('Bearer ') ? cabecera.slice('Bearer '.length) : undefined;
}

/** @param {string | undefined} token */
export function rolesDe(token) {
  return token ? ROLES_POR_TOKEN[token] : undefined;
}
