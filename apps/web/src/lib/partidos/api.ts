import type {
  ApuestaDto,
  CompeticionDto,
  ConsumoProveedorDto,
  EstadoApuesta,
  EstadoPartido,
  Pagina,
  PartidoDetalleDto,
  PartidoResumenDto,
  SolicitudVivoAceptadaDto,
  SolicitudVivoDto,
  TipoMercado,
} from '@apuestas/shared';
import { z, type ZodType } from 'zod';
import { api, ErrorApi } from '@/lib/api-cliente';
import {
  apuestaEsquema,
  competicionEsquema,
  consumoEsquema,
  cuotasVigentesEsquema,
  paginaEsquema,
  partidoDetalleEsquema,
  partidoResumenEsquema,
  solicitudVivoAceptadaEsquema,
  solicitudVivoEsquema,
} from './esquemas';

/**
 * Cliente REST del Spec 3 para el navegador (siempre por el proxy `/api/*` de la web, contrato 6). Toda respuesta
 * se valida con su esquema: si la API cambia de forma, la pantalla muestra un error en lugar de datos raros.
 */

async function pedir<T>(
  esquema: ZodType<T>,
  ruta: string,
  opciones?: Parameters<typeof api>[1],
): Promise<T> {
  const lectura = esquema.safeParse(await api<unknown>(ruta, opciones));
  if (!lectura.success) {
    throw new ErrorApi(
      502,
      'La respuesta del servidor no tiene el formato esperado. Recarga la página.',
    );
  }
  return lectura.data;
}

export interface FiltrosCartelera {
  readonly estado?: EstadoPartido;
  readonly competicionId?: string;
  readonly pagina?: number;
}

export function listarPartidos(filtros: FiltrosCartelera = {}): Promise<Pagina<PartidoResumenDto>> {
  const parametros = new URLSearchParams();
  if (filtros.estado) parametros.set('estado', filtros.estado);
  if (filtros.competicionId) parametros.set('competicionId', filtros.competicionId);
  if (filtros.pagina) parametros.set('pagina', String(filtros.pagina));
  const consulta = parametros.size ? `?${parametros.toString()}` : '';
  return pedir(paginaEsquema(partidoResumenEsquema), `/partidos${consulta}`);
}

export function obtenerPartido(id: string): Promise<PartidoDetalleDto> {
  return pedir(partidoDetalleEsquema, `/partidos/${encodeURIComponent(id)}`);
}

export function listarCompeticiones(): Promise<CompeticionDto[]> {
  return pedir(z.array(competicionEsquema), '/competiciones');
}

// --- Apuestas ---

export interface SolicitudApuesta {
  readonly claveSolicitud: string;
  readonly monto: string;
  readonly selecciones: ReadonlyArray<{
    readonly seleccionId: string;
    readonly cuotaVista: string;
  }>;
  readonly codigoCupon?: string;
}

export type ResultadoApuesta =
  | { readonly tipo: 'aceptada'; readonly apuesta: ApuestaDto }
  | { readonly tipo: 'en-espera'; readonly solicitud: SolicitudVivoAceptadaDto };

/** POST /apuestas: 201/200 con la apuesta; 202 con la solicitud en vivo que espera el retardo. */
export async function apostar(solicitud: SolicitudApuesta): Promise<ResultadoApuesta> {
  const cuerpo = await api<unknown>('/apuestas', { metodo: 'POST', cuerpo: solicitud });
  const enEspera = solicitudVivoAceptadaEsquema.safeParse(cuerpo);
  if (enEspera.success) return { tipo: 'en-espera', solicitud: enEspera.data };
  const aceptada = apuestaEsquema.safeParse(cuerpo);
  if (aceptada.success) return { tipo: 'aceptada', apuesta: aceptada.data };
  throw new ErrorApi(
    502,
    'La respuesta del servidor no tiene el formato esperado. Recarga la página.',
  );
}

/** Cuotas vigentes de un rechazo CUOTA_CAMBIADA, para reconfirmar con las nuevas (FR-016). */
export function cuotasVigentesDe(error: unknown): ReadonlyMap<string, string> | null {
  if (!(error instanceof ErrorApi) || error.codigo !== 'CUOTA_CAMBIADA') return null;
  const lectura = cuotasVigentesEsquema.safeParse(error.cuerpo);
  if (!lectura.success) return null;
  return new Map(lectura.data.cuotasVigentes.map((c) => [c.seleccionId, c.cuota]));
}

export function misApuestas(pagina = 1, estado?: EstadoApuesta): Promise<Pagina<ApuestaDto>> {
  const parametros = new URLSearchParams({ pagina: String(pagina) });
  if (estado) parametros.set('estado', estado);
  return pedir(paginaEsquema(apuestaEsquema), `/apuestas?${parametros.toString()}`);
}

export function solicitudVivo(id: string): Promise<SolicitudVivoDto> {
  return pedir(solicitudVivoEsquema, `/apuestas/solicitudes-vivo/${encodeURIComponent(id)}`);
}

// --- Operador ---

const ruta = (partidoId: string, accion = '') =>
  `/operador/partidos/${encodeURIComponent(partidoId)}${accion}`;

export const operador = {
  crearCompeticion: (nombre: string, pais?: string) =>
    pedir(competicionEsquema, '/operador/competiciones', {
      metodo: 'POST',
      cuerpo: pais ? { nombre, pais } : { nombre },
    }),
  crearPartido: (datos: {
    competicionId: string;
    nombreLocal: string;
    nombreVisitante: string;
    inicioEn: string;
  }) => pedir(partidoDetalleEsquema, '/operador/partidos', { metodo: 'POST', cuerpo: datos }),
  cambiarEstado: (partidoId: string, estado: EstadoPartido, motivo: string, inicioEn?: string) =>
    pedir(partidoDetalleEsquema, ruta(partidoId, '/estado'), {
      metodo: 'POST',
      cuerpo: inicioEn ? { estado, motivo, inicioEn } : { estado, motivo },
    }),
  actualizarMarcador: (
    partidoId: string,
    golesLocal: number,
    golesVisitante: number,
    minuto?: number,
  ) =>
    pedir(partidoDetalleEsquema, ruta(partidoId, '/marcador'), {
      metodo: 'POST',
      cuerpo:
        minuto === undefined
          ? { golesLocal, golesVisitante }
          : { golesLocal, golesVisitante, minuto },
    }),
  /** Finaliza el partido o, si ya está finalizado, corrige su resultado (HU8). */
  registrarResultado: (
    partidoId: string,
    golesLocal: number,
    golesVisitante: number,
    motivo: string,
  ) =>
    pedir(partidoDetalleEsquema, ruta(partidoId, '/resultado'), {
      metodo: 'POST',
      cuerpo: { golesLocal, golesVisitante, motivo },
    }),
  crearMercado: (
    partidoId: string,
    datos: {
      tipo: TipoMercado;
      linea?: string;
      admiteVivo: boolean;
      selecciones: Array<{ codigo: string; cuota: string }>;
    },
  ) =>
    pedir(partidoDetalleEsquema, ruta(partidoId, '/mercados'), { metodo: 'POST', cuerpo: datos }),
  cambiarCuota: (seleccionId: string, cuota: string) =>
    pedir(partidoDetalleEsquema, `/operador/selecciones/${encodeURIComponent(seleccionId)}/cuota`, {
      metodo: 'PUT',
      cuerpo: { cuota },
    }),
  cambiarEstadoMercado: (mercadoId: string, accion: 'suspender' | 'reabrir', motivo: string) =>
    pedir(partidoDetalleEsquema, `/operador/mercados/${encodeURIComponent(mercadoId)}/${accion}`, {
      metodo: 'POST',
      cuerpo: { motivo },
    }),
  consumoProveedor: (): Promise<ConsumoProveedorDto> =>
    pedir(consumoEsquema, '/operador/proveedor/consumo'),
  simular: (partidoId: string, tipo: string, equipo?: 'LOCAL' | 'VISITANTE') =>
    pedir(
      partidoDetalleEsquema,
      `/operador/simulacion/partidos/${encodeURIComponent(partidoId)}/eventos`,
      {
        metodo: 'POST',
        cuerpo: equipo ? { tipo, equipo } : { tipo },
      },
    ),
};
