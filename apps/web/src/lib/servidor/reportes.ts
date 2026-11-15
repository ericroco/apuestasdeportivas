import 'server-only';
import { z, type ZodType } from 'zod';
import {
  consultaReporte,
  type FiltrosReporte,
  type FormatoExportacion,
} from '@/lib/reportes/filtros';
import type { FalloConsulta, Resultado, TipoFallo } from '@/lib/resultado';
import {
  esquemaCompeticiones,
  esquemaResumen,
  esquemaSerieDiaria,
  type DesgloseCompeticiones,
  type ResumenReporte,
  type SerieDiaria,
} from './esquemas-reportes';
import {
  falloDeRespuesta,
  interpretar,
  normalizarToken,
  pedir,
  unirUrl,
  type ErrorDeServicio,
  type OpcionesHttp,
} from './http';

/**
 * Cliente de `apps/reports` desde el servidor de Next.js (FR-033). El token de la cookie `acceso` viaja
 * como `Authorization: Bearer` en la llamada servidor a servidor; nunca llega al navegador.
 */

export interface OpcionesClienteReportes extends OpcionesHttp {
  readonly urlBase: string;
  readonly token: string | null | undefined;
}

export interface Descarga {
  readonly cuerpo: ReadableStream<Uint8Array>;
  readonly tipoContenido: string;
  readonly nombreArchivo: string;
}

export interface ClienteReportes {
  resumen(filtros: FiltrosReporte): Promise<Resultado<ResumenReporte>>;
  serieDiaria(filtros: FiltrosReporte): Promise<Resultado<SerieDiaria>>;
  competiciones(filtros: FiltrosReporte): Promise<Resultado<DesgloseCompeticiones>>;
  exportar(filtros: FiltrosReporte, formato: FormatoExportacion): Promise<Resultado<Descarga>>;
}

/** Generar el PDF puede tardar más que una consulta. */
const TIMEOUT_EXPORTACION_MS = 30_000;

const TIPO_CONTENIDO: Readonly<Record<FormatoExportacion, string>> = {
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

/** Formato de error de reportes: `{ detail: { codigo, mensaje } }`; FastAPI valida con `{ detail: [...] }`. */
const esquemaErrorReportes = z.object({
  detail: z.union([
    z.object({ codigo: z.string().optional(), mensaje: z.string().optional() }),
    z.array(z.unknown()),
  ]),
});

function leerErrorReportes(cuerpo: unknown): ErrorDeServicio {
  const error = esquemaErrorReportes.safeParse(cuerpo);
  if (!error.success) return {};
  const { detail } = error.data;
  if (Array.isArray(detail)) {
    return {
      codigo: 'FILTROS_INVALIDOS',
      mensaje: 'Revisa los filtros del reporte: falta alguno o no tiene el formato esperado.',
    };
  }
  return { codigo: detail.codigo, mensaje: detail.mensaje };
}

export function crearClienteReportes({
  urlBase,
  token,
  ...opciones
}: OpcionesClienteReportes): ClienteReportes {
  const acceso = normalizarToken(token);
  const autorizacion = { authorization: `Bearer ${acceso}` };

  async function obtener<T>(
    ruta: string,
    filtros: FiltrosReporte,
    esquema: ZodType<T>,
  ): Promise<Resultado<T>> {
    if (acceso === null) return { tipo: 'sin-sesion' };
    const url = unirUrl(urlBase, `${ruta}${consultaReporte(filtros)}`);
    const init = { method: 'GET', headers: { accept: 'application/json', ...autorizacion } };
    return interpretar(await pedir(url, init, opciones), esquema, leerErrorReportes);
  }

  async function exportar(
    filtros: FiltrosReporte,
    formato: FormatoExportacion,
  ): Promise<Resultado<Descarga>> {
    if (acceso === null) return { tipo: 'sin-sesion' };
    const tipo = TIPO_CONTENIDO[formato];
    const url = unirUrl(urlBase, `/reportes/exportar${consultaReporte(filtros, { formato })}`);
    const init = { method: 'GET', headers: { accept: tipo, ...autorizacion } };
    const respuesta = await pedir(url, init, {
      ...opciones,
      timeoutMs: opciones.timeoutMs ?? TIMEOUT_EXPORTACION_MS,
    });
    if (respuesta === null) return { tipo: 'no-disponible' };
    if (!respuesta.ok) return falloDeRespuesta(respuesta, leerErrorReportes);
    const recibido = respuesta.headers.get('content-type') ?? '';
    if (!recibido.startsWith(tipo.split(';')[0]!) || respuesta.body === null) {
      await respuesta.body?.cancel();
      return { tipo: 'no-disponible' };
    }
    // El nombre se arma con las fechas ya validadas: no se confía en el Content-Disposition recibido.
    const nombreArchivo = `reporte-${filtros.desde}-${filtros.hasta}.${formato}`;
    return { tipo: 'ok', datos: { cuerpo: respuesta.body, tipoContenido: tipo, nombreArchivo } };
  }

  return {
    resumen: (filtros) => obtener('/reportes/resumen', filtros, esquemaResumen),
    serieDiaria: (filtros) => obtener('/reportes/serie-diaria', filtros, esquemaSerieDiaria),
    competiciones: (filtros) => obtener('/reportes/competiciones', filtros, esquemaCompeticiones),
    exportar,
  };
}

export interface Tablero {
  readonly resumen: ResumenReporte;
  readonly serie: SerieDiaria;
  readonly competiciones: DesgloseCompeticiones;
}

/** Si varias partes fallan, se explica primero lo que el administrador puede resolver. */
const PRIORIDAD_FALLO: readonly TipoFallo[] = [
  'sin-sesion',
  'sin-permiso',
  'rechazo',
  'no-disponible',
];

function falloPrioritario(fallos: readonly FalloConsulta[]): FalloConsulta {
  return fallos.reduce((elegido, fallo) =>
    PRIORIDAD_FALLO.indexOf(fallo.tipo) < PRIORIDAD_FALLO.indexOf(elegido.tipo) ? fallo : elegido,
  );
}

/**
 * Las tres consultas del dashboard en paralelo. Si una falla no se muestra ninguna: una vista a medias
 * podría hacer pasar cifras incompletas por el total del periodo.
 */
export async function obtenerTablero(
  cliente: ClienteReportes,
  filtros: FiltrosReporte,
): Promise<Resultado<Tablero>> {
  const [resumen, serie, competiciones] = await Promise.all([
    cliente.resumen(filtros),
    cliente.serieDiaria(filtros),
    cliente.competiciones(filtros),
  ]);
  if (resumen.tipo === 'ok' && serie.tipo === 'ok' && competiciones.tipo === 'ok') {
    return {
      tipo: 'ok',
      datos: { resumen: resumen.datos, serie: serie.datos, competiciones: competiciones.datos },
    };
  }
  const fallos = [resumen, serie, competiciones].flatMap((parte): FalloConsulta[] =>
    parte.tipo === 'ok' ? [] : [parte],
  );
  return falloPrioritario(fallos);
}
