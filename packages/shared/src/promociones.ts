/**
 * Contrato de las respuestas de cupones, bonos y alertas de apps/api (Spec 4).
 * Ver specs/004-promociones-fraude-reportes/contracts/api-rest.md y data-model.md.
 *
 * Montos, porcentajes y cuotas viajan como texto decimal ("10.50"): quien los recibe los muestra, nunca los
 * convierte a `number` para calcular (constitución, principio III). Las fechas van en ISO 8601 UTC.
 */

/** Texto decimal con hasta dos decimales, p. ej. `"10.50"`. */
export type TextoDecimal = string;

/** Fecha ISO 8601 en UTC, según el reloj del servidor. */
export type FechaIso = string;

export const TIPOS_CUPON = ['BONO_DEPOSITO', 'APUESTA_GRATIS', 'AUMENTO_CUOTA'] as const;
export type TipoCupon = (typeof TIPOS_CUPON)[number];

export const ESTADOS_CUPON = ['ACTIVO', 'PAUSADO'] as const;
export type EstadoCupon = (typeof ESTADOS_CUPON)[number];

export const ESTADOS_BONO = ['ACTIVO', 'CUMPLIDO', 'VENCIDO'] as const;
export type EstadoBono = (typeof ESTADOS_BONO)[number];

/** Motivos de rechazo de un canje (`canje_cupon.motivo`, tabla de data-model.md). */
export const MOTIVOS_RECHAZO_CUPON = [
  'CUPON_INEXISTENTE',
  'CUPON_PAUSADO',
  'CUPON_NO_VIGENTE',
  'CUPON_VENCIDO',
  'CUPON_AGOTADO',
  'LIMITE_USUARIO',
  'TIPO_NO_APLICA',
  'MONTO_SUPERA_CUPON',
  'DEPOSITO_INSUFICIENTE',
  'BONO_ACTIVO',
  'CUENTA_MULTIPLE',
  'USUARIO_EN_REVISION',
] as const;
export type MotivoRechazoCupon = (typeof MOTIVOS_RECHAZO_CUPON)[number];

export const REGLAS_FRAUDE = [
  'CUENTAS_DISPOSITIVO',
  'CUENTAS_IP',
  'METODO_PAGO_COMPARTIDO',
  'CUPON_CUENTA_MULTIPLE',
  'APUESTA_MONTO_ANOMALO',
  'RAFAGA_APUESTAS',
  'RETIRO_TRAS_DEPOSITO',
] as const;
export type ReglaFraude = (typeof REGLAS_FRAUDE)[number];

export const SEVERIDADES_ALERTA = ['MEDIA', 'ALTA'] as const;
export type SeveridadAlerta = (typeof SEVERIDADES_ALERTA)[number];

export const ESTADOS_ALERTA = ['ABIERTA', 'CONFIRMADA', 'DESCARTADA'] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];

/** Estados finales a los que el administrador puede llevar una alerta abierta. */
export const RESOLUCIONES_ALERTA = ['CONFIRMADA', 'DESCARTADA'] as const;
export type ResolucionAlerta = (typeof RESOLUCIONES_ALERTA)[number];

/** Códigos estables del formato de error de la API (contracts/api-rest.md, "Errores"). */
export const CODIGOS_ERROR_PROMOCIONES = [
  'DATOS_INVALIDOS',
  'CODIGO_DUPLICADO',
  'CUPON_CON_CANJES',
  'CAMBIO_NO_PERMITIDO',
  'NO_ENCONTRADO',
  'ALERTA_RESUELTA',
  'DEPENDENCIA_NO_DISPONIBLE',
] as const;
export type CodigoErrorPromociones = (typeof CODIGOS_ERROR_PROMOCIONES)[number];

/** Cuerpo de error uniforme del Spec 1 con un `codigo` estable. */
export interface ErrorApi {
  statusCode: number;
  error: string;
  codigo: string;
  message: string;
}

/** Lista paginada: `pagina` desde 1 y `tamano` de 1 a 100. */
export interface Paginado<T> {
  datos: T[];
  total: number;
  pagina: number;
  tamano: number;
}

/** Vista del cupón: respuesta de todas las rutas de `/api/cupones`. */
export interface VistaCupon {
  id: string;
  codigo: string;
  tipo: TipoCupon;
  porcentaje: TextoDecimal | null;
  montoFijo: TextoDecimal | null;
  topeBono: TextoDecimal | null;
  depositoMinimo: TextoDecimal | null;
  apuestaMaxima: TextoDecimal | null;
  iniciaEn: FechaIso;
  terminaEn: FechaIso;
  cupoTotal: number;
  limitePorUsuario: number;
  canjes: number;
  estado: EstadoCupon;
  /** Lo calcula la API con su reloj: `iniciaEn ≤ ahora < terminaEn`. */
  vigente: boolean;
  creadoEn: FechaIso;
}

export interface ResumenCanjes {
  aceptados: number;
  rechazados: number;
  bonoOtorgado: TextoDecimal;
}

/** `GET /api/cupones/:id`. */
export interface DetalleCupon extends VistaCupon {
  resumenCanjes: ResumenCanjes;
}

interface DatosComunesCupon {
  codigo: string;
  iniciaEn: FechaIso;
  terminaEn: FechaIso;
  cupoTotal: number;
  limitePorUsuario: number;
}

/** `POST /api/cupones`: cada tipo lleva solo sus campos; uno que no corresponde se rechaza. */
export type SolicitudCrearCupon =
  | (DatosComunesCupon & {
      tipo: 'BONO_DEPOSITO';
      porcentaje: TextoDecimal;
      topeBono: TextoDecimal;
      depositoMinimo: TextoDecimal;
    })
  | (DatosComunesCupon & { tipo: 'APUESTA_GRATIS'; montoFijo: TextoDecimal })
  | (DatosComunesCupon & {
      tipo: 'AUMENTO_CUOTA';
      porcentaje: TextoDecimal;
      apuestaMaxima: TextoDecimal;
    });

/**
 * `PATCH /api/cupones/:id`. Siempre permitidos: `estado`, `terminaEn` (solo posterior a la actual) y
 * `cupoTotal` (solo mayor). El resto solo mientras el cupón no tenga canjes.
 */
export interface CambioCupon {
  estado?: EstadoCupon;
  terminaEn?: FechaIso;
  cupoTotal?: number;
  tipo?: TipoCupon;
  porcentaje?: TextoDecimal;
  montoFijo?: TextoDecimal;
  topeBono?: TextoDecimal;
  depositoMinimo?: TextoDecimal;
  apuestaMaxima?: TextoDecimal;
  iniciaEn?: FechaIso;
  limitePorUsuario?: number;
}

export interface MotivoRechazo {
  codigo: MotivoRechazoCupon;
  mensaje: string;
}

/** `GET /api/cupones/vista-previa/:codigo`. Con un código inexistente solo trae el motivo. */
export interface VistaPreviaCupon {
  codigo: string;
  tipo: TipoCupon | null;
  descripcion: string | null;
  terminaEn: FechaIso | null;
  puedeUsar: boolean;
  motivo: MotivoRechazo | null;
}

export interface VistaBono {
  id: string;
  monto: TextoDecimal;
  requisito: TextoDecimal;
  avance: TextoDecimal;
  /** Lo calcula la API (0–100). */
  porcentajeAvance: number;
  estado: EstadoBono;
  otorgadoEn: FechaIso;
  venceEn: FechaIso;
  codigoCupon: string;
}

/** Bono cumplido o vencido. */
export interface BonoHistorial extends VistaBono {
  montoConvertido: TextoDecimal | null;
  cumplidoEn: FechaIso | null;
}

export interface CanjeRechazado {
  codigo: string;
  motivo: MotivoRechazo;
  creadoEn: FechaIso;
}

/** `GET /api/bonos/mios`. */
export interface MisBonos {
  activo: VistaBono | null;
  historial: BonoHistorial[];
  canjesRechazados: CanjeRechazado[];
  /** Cuota total mínima para que una apuesta cuente en el rollover. */
  cuotaMinima: TextoDecimal;
}

/** Vista de una alerta de fraude (`GET /api/alertas` y `GET /api/alertas/:id`). */
export interface VistaAlerta {
  id: string;
  regla: ReglaFraude;
  severidad: SeveridadAlerta;
  usuarioId: string;
  /** Cuentas relacionadas, dispositivo, IP, montos o ventana, según la regla. */
  evidencia: Record<string, unknown>;
  estado: EstadoAlerta;
  nota: string | null;
  resueltaPor: string | null;
  resueltaEn: FechaIso | null;
  creadaEn: FechaIso;
}

/** `POST /api/alertas/:id/resolucion`: `nota` de 5 a 500 caracteres. */
export interface SolicitudResolucionAlerta {
  estado: ResolucionAlerta;
  nota: string;
}
