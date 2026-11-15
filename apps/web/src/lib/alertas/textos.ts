import type { EstadoAlerta, ReglaFraude, SeveridadAlerta } from '@apuestas/shared';
import { formatearEntero, formatearFechaHora, formatearMonto } from '@/lib/formato';

/** Cómo se nombran las alertas de fraude y su evidencia en la interfaz del administrador. */

export const NOMBRE_REGLA: Readonly<Record<ReglaFraude, string>> = {
  CUENTAS_DISPOSITIVO: 'Cuentas múltiples por dispositivo',
  CUENTAS_IP: 'Cuentas múltiples por IP',
  METODO_PAGO_COMPARTIDO: 'Método de pago compartido',
  CUPON_CUENTA_MULTIPLE: 'Cupón usado desde otra cuenta',
  APUESTA_MONTO_ANOMALO: 'Apuesta anómala por monto',
  RAFAGA_APUESTAS: 'Ráfaga de apuestas',
  RETIRO_TRAS_DEPOSITO: 'Retiro tras depósito sin actividad',
};

export const NOMBRE_SEVERIDAD: Readonly<Record<SeveridadAlerta, string>> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
};

export const NOMBRE_ESTADO_ALERTA: Readonly<Record<EstadoAlerta, string>> = {
  ABIERTA: 'Abierta',
  CONFIRMADA: 'Fraude confirmado',
  DESCARTADA: 'Descartada',
};

const ETIQUETAS_EVIDENCIA: Readonly<Record<string, string>> = {
  dispositivo: 'Dispositivo',
  ip: 'Dirección IP',
  cuentas: 'Cuentas relacionadas',
  usuarios: 'Cuentas relacionadas',
  metodoPagoHuella: 'Método de pago (huella)',
  monto: 'Monto',
  montoApuesta: 'Monto de la apuesta',
  promedio: 'Promedio de las apuestas previas',
  apuestaId: 'Apuesta',
  apuestas: 'Apuestas',
  depositoId: 'Depósito',
  montoDeposito: 'Monto del depósito',
  montoApostado: 'Apostado desde el depósito',
  montoRetiro: 'Monto del retiro',
  cuponId: 'Cupón',
  ventanaSegundos: 'Ventana (segundos)',
  ventanaHoras: 'Ventana (horas)',
};

const ES_MONTO = /^(monto|promedio|apostado)/i;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ES_DECIMAL = /^-?\d+(\.\d+)?$/;

export interface DatoEvidencia {
  readonly clave: string;
  readonly etiqueta: string;
  readonly valores: readonly string[];
}

/** `metodoPagoHuella` → "Metodo pago huella": para claves que la interfaz aún no conoce. */
function humanizar(clave: string): string {
  const texto = clave
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function textoDe(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined) return 'Sin dato';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  const texto = String(valor);
  if (ES_MONTO.test(clave) && ES_DECIMAL.test(texto)) return formatearMonto(texto);
  if (typeof valor === 'number') return Number.isInteger(valor) ? formatearEntero(valor) : texto;
  if (ES_FECHA.test(texto) && !Number.isNaN(Date.parse(texto))) return formatearFechaHora(texto);
  return typeof valor === 'object' ? JSON.stringify(valor) : texto;
}

function valoresDe(clave: string, valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map((elemento) => textoDe(clave, elemento));
  if (typeof valor === 'object' && valor !== null) {
    return Object.entries(valor).map(([sub, dato]) => `${sub}: ${textoDe(sub, dato)}`);
  }
  return [textoDe(clave, valor)];
}

/**
 * Evidencia de la alerta en filas legibles. Los textos vienen de la API y se muestran como texto (React
 * los escapa); nada se interpreta como HTML.
 */
export function describirEvidencia(evidencia: Readonly<Record<string, unknown>>): DatoEvidencia[] {
  return Object.entries(evidencia).map(([clave, valor]) => ({
    clave,
    etiqueta: ETIQUETAS_EVIDENCIA[clave] ?? humanizar(clave),
    valores: valoresDe(clave, valor),
  }));
}
