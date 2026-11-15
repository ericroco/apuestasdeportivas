// Servicio de reportes simulado (contracts/reportes.md): solo acepta `Authorization: Bearer` de administrador.
import { enviarJson, rolesDe, tokenBearer } from './http.mjs';

const MS_DIA = 24 * 60 * 60 * 1000;
const DIAS_MAXIMOS = 366;
const COMPETICIONES = [
  {
    competicionId: '0b6f7a1c-1d2e-4f30-8a4b-5c6d7e8f9a0b',
    nombre: 'LigaPro',
    deporte: 'futbol',
    apuestas: 300,
    volumen: '3000.00',
    ggr: '250.00',
  },
  {
    competicionId: '1c7a8b2d-2e3f-4a41-9b5c-6d7e8f9a0b1c',
    nombre: '=Copa Libertadores',
    deporte: 'futbol',
    apuestas: 120,
    volumen: '1500.00',
    ggr: '-20.00',
  },
];

/** @param {import('node:http').ServerResponse} respuesta */
function error(respuesta, estado, codigo, mensaje) {
  const cabeceras = estado === 401 ? { 'www-authenticate': 'Bearer' } : {};
  respuesta.writeHead(estado, { 'content-type': 'application/json', ...cabeceras });
  respuesta.end(JSON.stringify({ detail: { codigo, mensaje } }));
}

function resumen(filtros) {
  const vacio = filtros.usuario === 'vacio@correo.ec';
  const cero = (texto) => (vacio ? '0.00' : texto);
  const entero = (valor) => (vacio ? 0 : valor);
  return {
    filtros,
    apuestas: {
      cantidad: entero(1520),
      volumen: cero(filtros.competicionId ? '3000.00' : '15200.00'),
      premiosPagados: cero('13100.00'),
      ggr: cero('1850.00'),
      usuariosActivos: entero(87),
    },
    depositos: { cantidad: entero(210), monto: cero('21000.00') },
    retiros: { cantidad: entero(45), monto: cero('6400.00') },
    cupones: {
      canjesAceptados: entero(60),
      canjesRechazados: entero(7),
      bonoOtorgado: cero('540.00'),
    },
    alertas: {
      abiertas: entero(4),
      confirmadas: entero(2),
      descartadas: entero(5),
      altas: entero(6),
      medias: entero(5),
    },
    generadoEn: new Date().toISOString(),
  };
}

function serie(filtros, dias) {
  const vacio = filtros.usuario === 'vacio@correo.ec';
  return {
    filtros,
    dias: dias.map((fecha, indice) => {
      const volumen = vacio || indice % 7 === 6 ? 0 : ((indice * 37) % 11) * 100 + 50;
      return {
        fecha,
        volumen: `${volumen}.00`,
        premiosPagados: `${Math.round(volumen * 0.8)}.00`,
        ggr: `${volumen - Math.round(volumen * 0.8)}.00`,
        apuestas: volumen / 10,
        depositos: `${volumen * 2}.00`,
        retiros: '0.00',
      };
    }),
  };
}

function competiciones(filtros) {
  const lista = filtros.usuario === 'vacio@correo.ec' ? [] : COMPETICIONES;
  return {
    filtros,
    competiciones: lista.filter(
      (c) => !filtros.competicionId || c.competicionId === filtros.competicionId,
    ),
  };
}

function exportar(respuesta, filtros, formato) {
  const nombre = `reporte-${filtros.desde}-${filtros.hasta}.${formato}`;
  const tipo = formato === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8';
  const cuerpo =
    formato === 'pdf'
      ? '%PDF-1.4\n% Reporte simulado\n%%EOF\n'
      : `﻿Resumen\nVolumen apostado;15200.00\nDesde;${filtros.desde}\nHasta;${filtros.hasta}\n`;
  respuesta.writeHead(200, {
    'content-type': tipo,
    'content-disposition': `attachment; filename="${nombre}"`,
  });
  respuesta.end(cuerpo);
}

/** Días del rango, o un error del contrato si el rango no sirve. */
function diasDelRango(consulta) {
  const desde = consulta.get('desde');
  const hasta = consulta.get('hasta');
  if (!desde || !hasta)
    return {
      estado: 422,
      cuerpo: { detail: [{ loc: ['query', 'desde'], msg: 'Field required' }] },
    };
  const inicio = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  if (fin < inicio) return { error: 'La fecha de fin debe ser igual o posterior a la de inicio.' };
  const cantidad = (fin - inicio) / MS_DIA + 1;
  if (cantidad > DIAS_MAXIMOS) return { error: 'El rango no puede superar 366 días.' };
  return {
    dias: Array.from({ length: cantidad }, (_, i) =>
      new Date(inicio + i * MS_DIA).toISOString().slice(0, 10),
    ),
  };
}

function filtrosDe(consulta) {
  const valor = (clave) => consulta.get(clave) || null;
  return {
    desde: valor('desde'),
    hasta: valor('hasta'),
    deporte: valor('deporte'),
    competicionId: valor('competicionId'),
    usuario: valor('usuario'),
  };
}

/** @param {import('node:http').IncomingMessage} peticion @param {import('node:http').ServerResponse} respuesta */
export function atenderReportes(peticion, respuesta) {
  const url = new URL(peticion.url ?? '/', 'http://simulado');
  if (url.pathname === '/health') return enviarJson(respuesta, 200, { estado: 'ok' });
  const roles = rolesDe(tokenBearer(peticion.headers.authorization));
  if (!roles) return error(respuesta, 401, 'TOKEN_INVALIDO', 'Falta un token válido.');
  if (!roles.includes('ADMINISTRADOR'))
    return error(respuesta, 403, 'SIN_PERMISO', 'Solo administradores.');
  const rango = diasDelRango(url.searchParams);
  if (rango.estado) return enviarJson(respuesta, rango.estado, rango.cuerpo);
  if (rango.error) return error(respuesta, 400, 'FILTROS_INVALIDOS', rango.error);
  const filtros = filtrosDe(url.searchParams);
  // `deporte=caido` simula el servicio sin base de datos.
  if (filtros.deporte === 'caido')
    return enviarJson(respuesta, 503, { detail: 'Servicio no disponible' });
  switch (url.pathname) {
    case '/reportes/resumen':
      return enviarJson(respuesta, 200, resumen(filtros));
    case '/reportes/serie-diaria':
      return enviarJson(respuesta, 200, serie(filtros, rango.dias));
    case '/reportes/competiciones':
      return enviarJson(respuesta, 200, competiciones(filtros));
    case '/reportes/exportar':
      return exportar(
        respuesta,
        filtros,
        url.searchParams.get('formato') === 'pdf' ? 'pdf' : 'csv',
      );
    default:
      return error(respuesta, 404, 'NO_ENCONTRADO', 'Ruta desconocida.');
  }
}
