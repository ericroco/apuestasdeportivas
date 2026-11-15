import type { CodigoSeleccion, EstadoPartido, TipoMercado } from '@apuestas/shared';

/**
 * Puerto del proveedor de datos deportivos (research.md §10). Dos adaptadores: ApiFootballProveedor (HTTP,
 * con presupuesto diario) y SimuladorProveedor (sin red). Lo que devuelven entra al sistema por
 * ImportacionService → PartidosService.aplicarActualizacion, el mismo camino que usa el operador.
 */

export interface CompeticionProveedor {
  readonly idProveedor: number;
  readonly nombre: string;
  readonly pais: string | null;
  /** Temporada del proveedor (las cuotas se piden por liga y temporada); no se guarda en la base. */
  readonly temporada: number;
}

/** Foto de un partido según el proveedor, ya traducida a nuestro modelo. */
export interface PartidoProveedor {
  readonly idProveedor: number;
  readonly competicion: CompeticionProveedor;
  readonly nombreLocal: string;
  readonly nombreVisitante: string;
  readonly inicioEn: Date;
  readonly estado: EstadoPartido;
  /** Marcador del tiempo reglamentario (FR-004); null si no empezó. */
  readonly golesLocal: number | null;
  readonly golesVisitante: number | null;
  readonly minuto: number | null;
}

export interface MercadoProveedor {
  readonly tipo: TipoMercado;
  readonly linea: string | null;
  readonly selecciones: ReadonlyArray<{ readonly codigo: CodigoSeleccion; readonly cuota: string }>;
}

export interface CuotasPartidoProveedor {
  readonly idProveedorPartido: number;
  readonly mercados: readonly MercadoProveedor[];
}

export interface ProveedorDeportivo {
  /** `true` si no consulta ninguna red (modo simulación). */
  readonly esSimulacion: boolean;
  /** Partidos de un día UTC (AAAA-MM-DD) de las ligas configuradas. */
  partidosDelDia(fecha: string): Promise<PartidoProveedor[]>;
  /** Partidos en vivo de las ligas configuradas. */
  partidosEnVivo(): Promise<PartidoProveedor[]>;
  /** Partidos por id del proveedor; para el resultado final de los que dejaron de estar en vivo. */
  partidosPorId(ids: readonly number[]): Promise<PartidoProveedor[]>;
  /** Cuotas pre-partido de una liga para un día. */
  cuotas(liga: number, temporada: number, fecha: string): Promise<CuotasPartidoProveedor[]>;
}

export const PROVEEDOR_DEPORTIVO = Symbol('PROVEEDOR_DEPORTIVO');

/** No hay cupo en el presupuesto diario: la consulta no se hizo (FR-010). */
export class PresupuestoAgotadoError extends Error {
  override readonly name = 'PresupuestoAgotadoError';
}

/** El proveedor respondió con error o no respondió: se reintenta más tarde (FR-012). */
export class ProveedorNoDisponibleError extends Error {
  override readonly name = 'ProveedorNoDisponibleError';
}
