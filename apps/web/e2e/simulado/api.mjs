// API simulada del Spec 4 para el E2E: cupones, bonos y alertas con el formato de error del contrato.
import { ALERTAS, CUPONES, MIS_BONOS, nuevaAlerta, nuevoCupon, vistaCupon } from './datos.mjs';
import { cookieAcceso, enviarJson, leerCuerpo, rolesDe } from './http.mjs';

const GESTION_CUPONES = ['OPERADOR', 'ADMINISTRADOR'];
const SOLO_ADMIN = ['ADMINISTRADOR'];

/** @typedef {import('node:http').ServerResponse} Respuesta */

/** @param {Respuesta} respuesta @param {number} estado @param {string} codigo @param {string} mensaje */
function error(respuesta, estado, codigo, mensaje) {
  enviarJson(respuesta, estado, { statusCode: estado, error: 'Error', codigo, message: mensaje });
}

/**
 * Responde 401 o 403 como el guard del contrato 1 y devuelve si la petición puede seguir.
 * @param {Respuesta} respuesta
 * @param {readonly string[] | undefined} roles
 * @param {readonly string[] | null} requeridos
 */
function autorizar(respuesta, roles, requeridos) {
  if (!roles) {
    error(respuesta, 401, 'NO_AUTENTICADO', 'Inicia sesión.');
    return false;
  }
  if (requeridos && !roles.some((rol) => requeridos.includes(rol))) {
    error(respuesta, 403, 'SIN_PERMISO', 'Sin permiso.');
    return false;
  }
  return true;
}

/** @param {URLSearchParams} consulta @param {object[]} elementos */
function paginar(consulta, elementos) {
  const pagina = Number(consulta.get('pagina') ?? 1);
  const tamano = Number(consulta.get('tamano') ?? 20);
  const datos = elementos.slice((pagina - 1) * tamano, pagina * tamano);
  return { datos, total: elementos.length, pagina, tamano };
}

function listarCupones(consulta) {
  const busqueda = consulta.get('busqueda')?.toUpperCase();
  const filtrados = CUPONES.filter(
    (cupon) =>
      (!consulta.get('estado') || cupon.estado === consulta.get('estado')) &&
      (!consulta.get('tipo') || cupon.tipo === consulta.get('tipo')) &&
      (!busqueda || cupon.codigo.startsWith(busqueda)),
  );
  return paginar(consulta, filtrados.toReversed().map(vistaCupon));
}

async function crearCupon(peticion, respuesta) {
  const datos = await leerCuerpo(peticion);
  if (!/^[A-Z0-9]{4,20}$/.test(String(datos.codigo))) {
    return error(respuesta, 400, 'DATOS_INVALIDOS', 'codigo: de 4 a 20 letras o números.');
  }
  if (CUPONES.some((cupon) => cupon.codigo === String(datos.codigo).toUpperCase())) {
    return error(respuesta, 409, 'CODIGO_DUPLICADO', 'Ya existe un cupón con ese código.');
  }
  const cupon = nuevoCupon(datos);
  CUPONES.push(cupon);
  enviarJson(respuesta, 201, vistaCupon(cupon));
}

async function cambiarCupon(peticion, respuesta, cupon) {
  const cambio = await leerCuerpo(peticion);
  if (cambio.terminaEn && Date.parse(cambio.terminaEn) <= Date.parse(cupon.terminaEn)) {
    return error(respuesta, 409, 'CAMBIO_NO_PERMITIDO', 'La vigencia solo se puede extender.');
  }
  if (cambio.cupoTotal !== undefined && cambio.cupoTotal <= cupon.cupoTotal) {
    return error(respuesta, 409, 'CAMBIO_NO_PERMITIDO', 'El cupo solo se puede ampliar.');
  }
  Object.assign(cupon, cambio);
  enviarJson(respuesta, 200, vistaCupon(cupon));
}

async function rutasCupones(peticion, respuesta, partes, consulta) {
  const [, , id] = partes;
  if (!id && peticion.method === 'GET') return enviarJson(respuesta, 200, listarCupones(consulta));
  if (!id && peticion.method === 'POST') return crearCupon(peticion, respuesta);
  const cupon = CUPONES.find((candidato) => candidato.id === id);
  if (!cupon) return error(respuesta, 404, 'NO_ENCONTRADO', 'El cupón no existe.');
  if (peticion.method === 'PATCH') return cambiarCupon(peticion, respuesta, cupon);
  enviarJson(respuesta, 200, { ...vistaCupon(cupon), resumenCanjes: cupon.resumenCanjes });
}

async function resolverAlerta(peticion, respuesta, alerta) {
  const { estado, nota } = await leerCuerpo(peticion);
  const largo = typeof nota === 'string' ? nota.trim().length : 0;
  if (!['CONFIRMADA', 'DESCARTADA'].includes(estado) || largo < 5 || largo > 500) {
    return error(respuesta, 400, 'DATOS_INVALIDOS', 'nota: de 5 a 500 caracteres.');
  }
  if (alerta.estado !== 'ABIERTA') {
    return error(respuesta, 409, 'ALERTA_RESUELTA', 'La alerta ya fue resuelta.');
  }
  Object.assign(alerta, {
    estado,
    nota,
    resueltaPor: 'admin-e2e',
    resueltaEn: new Date().toISOString(),
  });
  enviarJson(respuesta, 200, alerta);
}

function rutasAlertas(peticion, respuesta, partes, consulta) {
  const [, , id, accion] = partes;
  if (!id) {
    const filtradas = ALERTAS.filter((alerta) =>
      ['estado', 'severidad', 'regla', 'usuarioId'].every(
        (campo) => !consulta.get(campo) || alerta[campo] === consulta.get(campo),
      ),
    );
    return enviarJson(
      respuesta,
      200,
      paginar(
        consulta,
        filtradas.toSorted((a, b) => b.creadaEn.localeCompare(a.creadaEn)),
      ),
    );
  }
  const alerta = ALERTAS.find((candidata) => candidata.id === id);
  if (!alerta) return error(respuesta, 404, 'NO_ENCONTRADO', 'La alerta no existe.');
  if (accion === 'resolucion' && peticion.method === 'POST')
    return resolverAlerta(peticion, respuesta, alerta);
  enviarJson(respuesta, 200, alerta);
}

/** Rutas de control del E2E (sin sesión): preparan datos propios de cada prueba. */
function rutasControl(peticion, respuesta, partes) {
  if (partes[1] === 'alertas' && peticion.method === 'POST') {
    const alerta = nuevaAlerta();
    ALERTAS.push(alerta);
    return enviarJson(respuesta, 201, { id: alerta.id });
  }
  error(respuesta, 404, 'NO_ENCONTRADO', 'Ruta de control desconocida.');
}

/** @param {import('node:http').IncomingMessage} peticion @param {Respuesta} respuesta */
export async function atenderApi(peticion, respuesta) {
  const url = new URL(peticion.url ?? '/', 'http://simulado');
  const partes = url.pathname.split('/').filter(Boolean);
  if (url.pathname === '/health') return enviarJson(respuesta, 200, { estado: 'ok' });
  if (partes[0] === '__simulado') return rutasControl(peticion, respuesta, partes);
  // La web debe reenviar la cookie `acceso`; la API simulada no acepta otra forma de autenticarse.
  const roles = rolesDe(cookieAcceso(peticion.headers.cookie));
  if (partes[0] !== 'api') return error(respuesta, 404, 'NO_ENCONTRADO', 'Ruta desconocida.');
  if (partes[1] === 'cupones') {
    if (autorizar(respuesta, roles, GESTION_CUPONES))
      await rutasCupones(peticion, respuesta, partes, url.searchParams);
    return;
  }
  if (partes[1] === 'bonos' && partes[2] === 'mios') {
    if (autorizar(respuesta, roles, null)) enviarJson(respuesta, 200, MIS_BONOS);
    return;
  }
  if (partes[1] === 'alertas') {
    if (autorizar(respuesta, roles, SOLO_ADMIN))
      await rutasAlertas(peticion, respuesta, partes, url.searchParams);
    return;
  }
  error(respuesta, 404, 'NO_ENCONTRADO', 'Ruta desconocida.');
}
