/**
 * Eventos de dominio entre specs (docs/equipo/contratos.md §5).
 * Cada evento tiene un único spec que lo emite; los demás solo escuchan. El transporte (EventEmitter de Nest
 * dentro del proceso, o Redis/BullMQ si cruza procesos) lo decide quien emite, pero el nombre y el payload
 * son estos. Los montos viajan como texto decimal para no perder precisión al serializar.
 */

/** Spec 2: usuario registrado (Spec 4 detecta cuentas múltiples por IP/dispositivo). */
export interface UsuarioRegistrado {
  readonly usuarioId: string;
  readonly ip: string;
  readonly dispositivo: string;
}

/** Spec 2: depósito confirmado servidor a servidor con Payphone (Spec 4 aplica bonos de depósito). */
export interface DepositoConfirmado {
  readonly usuarioId: string;
  readonly depositoId: string;
  readonly monto: string;
  readonly codigoCupon: string | null;
}

/** Spec 2: retiro solicitado (Spec 4 registra alertas de fraude). */
export interface RetiroSolicitado {
  readonly usuarioId: string;
  readonly retiroId: string;
  readonly monto: string;
}

/** Spec 3: apuesta aceptada (Spec 4 detecta patrones anómalos). */
export interface ApuestaAceptada {
  readonly usuarioId: string;
  readonly apuestaId: string;
  readonly monto: string;
  readonly tipoSaldo: 'REAL' | 'BONO';
}

/** Spec 3: apuesta liquidada o anulada (Spec 4 acumula rollover). */
export interface ApuestaLiquidada {
  readonly usuarioId: string;
  readonly apuestaId: string;
  readonly resultado: 'GANADA' | 'PERDIDA' | 'ANULADA';
  readonly monto: string;
  readonly premio: string;
}

export const EVENTOS = {
  usuarioRegistrado: 'usuario.registrado',
  depositoConfirmado: 'deposito.confirmado',
  retiroSolicitado: 'retiro.solicitado',
  apuestaAceptada: 'apuesta.aceptada',
  apuestaLiquidada: 'apuesta.liquidada',
} as const;

export interface MapaEventos {
  'usuario.registrado': UsuarioRegistrado;
  'deposito.confirmado': DepositoConfirmado;
  'retiro.solicitado': RetiroSolicitado;
  'apuesta.aceptada': ApuestaAceptada;
  'apuesta.liquidada': ApuestaLiquidada;
}
