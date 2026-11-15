/**
 * Contrato de GET /health de apps/api y apps/reports.
 * Ver specs/001-fundaciones-stack/contracts/salud.openapi.yaml.
 */
export type EstadoSalud = 'ok' | 'error';

export type NombreServicio = 'api' | 'reports';

export interface EstadoDependencia {
  estado: EstadoSalud;
  latenciaMs: number;
}

export interface RespuestaSalud {
  estado: EstadoSalud;
  servicio: NombreServicio;
  version: string;
  /** Fecha ISO 8601 en UTC, según el reloj del servidor. */
  fecha: string;
  /** api: baseDeDatos y cache. reports: baseDeDatos. */
  dependencias: Record<string, EstadoDependencia>;
}
