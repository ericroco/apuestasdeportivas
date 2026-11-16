/**
 * Tipos del Spec 3 compartidos entre apps/web y apps/api: enums, respuestas REST y payloads de tiempo real.
 * Ver specs/003-partidos-apuestas-liquidacion/contracts/ (api-rest.md y tiempo-real.md).
 * Los montos y las cuotas viajan como texto decimal ("10.50") para no perder precisión; las fechas en ISO 8601 UTC.
 */

// TextoDecimal y FechaIso son los mismos tipos del Spec 4: se reutilizan, no se duplican.
import type { FechaIso, TextoDecimal } from './promociones.js';

export const ESTADOS_PARTIDO = [
  'PROGRAMADO',
  'EN_VIVO',
  'FINALIZADO',
  'SUSPENDIDO',
  'APLAZADO',
  'CANCELADO',
] as const;
export type EstadoPartido = (typeof ESTADOS_PARTIDO)[number];

export const ORIGENES_DATO = ['OPERADOR', 'PROVEEDOR', 'SIMULACION'] as const;
export type OrigenDato = (typeof ORIGENES_DATO)[number];

export const TIPOS_MERCADO = [
  'RESULTADO_FINAL',
  'DOBLE_OPORTUNIDAD',
  'MAS_MENOS_GOLES',
  'AMBOS_MARCAN',
] as const;
export type TipoMercado = (typeof TIPOS_MERCADO)[number];

export const ESTADOS_MERCADO = ['ABIERTO', 'SUSPENDIDO', 'CERRADO'] as const;
export type EstadoMercado = (typeof ESTADOS_MERCADO)[number];

export const CODIGOS_SELECCION = [
  'LOCAL',
  'EMPATE',
  'VISITANTE',
  'LOCAL_EMPATE',
  'EMPATE_VISITANTE',
  'LOCAL_VISITANTE',
  'MAS',
  'MENOS',
  'SI',
  'NO',
] as const;
export type CodigoSeleccion = (typeof CODIGOS_SELECCION)[number];

export const RESULTADOS_SELECCION = ['PENDIENTE', 'GANADORA', 'PERDEDORA', 'ANULADA'] as const;
export type ResultadoSeleccion = (typeof RESULTADOS_SELECCION)[number];

export const TIPOS_APUESTA = ['SIMPLE', 'COMBINADA'] as const;
export type TipoApuesta = (typeof TIPOS_APUESTA)[number];

export const ESTADOS_APUESTA = ['PENDIENTE', 'GANADA', 'PERDIDA', 'ANULADA'] as const;
export type EstadoApuesta = (typeof ESTADOS_APUESTA)[number];

export const TIPOS_SALDO = ['REAL', 'BONO'] as const;
export type TipoSaldoApuesta = (typeof TIPOS_SALDO)[number];

export const ESTADOS_SOLICITUD_VIVO = ['EN_ESPERA', 'ACEPTADA', 'RECHAZADA'] as const;
export type EstadoSolicitudVivo = (typeof ESTADOS_SOLICITUD_VIVO)[number];

/** Códigos estables de error de negocio (contracts/api-rest.md); la web los traduce a mensajes útiles. */
export const CODIGOS_ERROR = [
  'CUOTA_CAMBIADA',
  'SALDO_INSUFICIENTE',
  'SALDO_NEGATIVO',
  'MERCADO_CERRADO',
  'LIMITE_EXCEDIDO',
  'COMBINADA_INVALIDA',
  'CUPON_INVALIDO',
  'TRANSICION_INVALIDA',
  'PARTIDO_CON_APUESTAS',
  'ROL_NO_PUEDE_APOSTAR',
] as const;
export type CodigoErrorNegocio = (typeof CODIGOS_ERROR)[number];

export interface RespuestaErrorNegocio {
  statusCode: number;
  error: string;
  codigo: CodigoErrorNegocio;
  message: string;
  /** Datos propios del código, p. ej. `cuotasVigentes`, `saldoDisponible`, `limite`, `permitidas`. */
  [dato: string]: unknown;
}

// --- Respuestas REST ---

export interface CompeticionDto {
  id: string;
  nombre: string;
  pais: string | null;
}

export interface SeleccionDto {
  id: string;
  codigo: CodigoSeleccion;
  cuota: TextoDecimal;
  resultado: ResultadoSeleccion;
}

export interface MercadoDto {
  id: string;
  tipo: TipoMercado;
  /** Solo en MAS_MENOS_GOLES, p. ej. "2.5". */
  linea: string | null;
  estado: EstadoMercado;
  admiteVivo: boolean;
  selecciones: SeleccionDto[];
}

export interface PartidoResumenDto {
  id: string;
  competicion: CompeticionDto;
  nombreLocal: string;
  nombreVisitante: string;
  inicioEn: FechaIso;
  estado: EstadoPartido;
  golesLocal: number | null;
  golesVisitante: number | null;
  minuto: number | null;
}

export interface PartidoDetalleDto extends PartidoResumenDto {
  version: number;
  mercados: MercadoDto[];
}

export interface Pagina<T> {
  elementos: T[];
  pagina: number;
  porPagina: number;
  total: number;
}

export interface SeleccionApostadaDto {
  id: string;
  seleccionId: string;
  partidoId: string;
  cuotaCongelada: TextoDecimal;
  resultado: ResultadoSeleccion;
}

export interface ApuestaDto {
  id: string;
  tipo: TipoApuesta;
  monto: TextoDecimal;
  tipoSaldo: TipoSaldoApuesta;
  cuotaTotal: TextoDecimal;
  gananciaPotencial: TextoDecimal;
  estado: EstadoApuesta;
  premioPagado: TextoDecimal;
  enVivo: boolean;
  aceptadaEn: FechaIso;
  liquidadaEn: FechaIso | null;
  selecciones: SeleccionApostadaDto[];
}

export interface SolicitudVivoAceptadaDto {
  solicitudId: string;
  ejecutarEn: FechaIso;
}

/** Estado de una apuesta en vivo en espera (GET /apuestas/solicitudes-vivo/:id). */
export interface SolicitudVivoDto {
  id: string;
  estado: EstadoSolicitudVivo;
  apuestaId: string | null;
  /** Código legible: CUOTA_CAMBIADA, MERCADO_CERRADO, MARCADOR_CAMBIO, SALDO_INSUFICIENTE… */
  motivoRechazo: string | null;
  ejecutarEn: FechaIso;
  creadaEn: FechaIso;
}

export interface TicketTiempoRealDto {
  ticket: string;
  expiraEn: FechaIso;
}

export interface ConsumoProveedorDto {
  fecha: string;
  consultas: number;
  limite: number;
  agotado: boolean;
}

// --- Tiempo real (Socket.IO, espacio de nombres /tiempo-real) ---

export const ESPACIO_TIEMPO_REAL = '/tiempo-real';

export const EVENTOS_TIEMPO_REAL = {
  partidoSeguir: 'partido.seguir',
  partidoDejar: 'partido.dejar',
  partidoActualizado: 'partido.actualizado',
  mercadoActualizado: 'mercado.actualizado',
  apuestaLiquidada: 'apuesta.liquidada',
  apuestaVivoResuelta: 'apuesta.vivo_resuelta',
} as const;

/** Todo mensaje del servidor lleva `emitidoEn` para medir la latencia de SC-001. */
interface MensajeServidor {
  emitidoEn: FechaIso;
}

export interface PartidoActualizadoPayload extends MensajeServidor {
  partidoId: string;
  estado: EstadoPartido;
  golesLocal: number | null;
  golesVisitante: number | null;
  minuto: number | null;
  version: number;
}

export interface MercadoActualizadoPayload extends MensajeServidor {
  partidoId: string;
  mercadoId: string;
  estado: EstadoMercado;
  selecciones: Array<{ id: string; cuota: TextoDecimal }>;
}

export interface ApuestaLiquidadaPayload extends MensajeServidor {
  apuestaId: string;
  estado: EstadoApuesta;
  premio: TextoDecimal;
  liquidadaEn: FechaIso;
}

export interface ApuestaVivoResueltaPayload extends MensajeServidor {
  solicitudId: string;
  estado: Exclude<EstadoSolicitudVivo, 'EN_ESPERA'>;
  apuestaId?: string;
  motivo?: string;
}

export interface SeguirPartidoPayload {
  partidoId: string;
}
