/**
 * Puerto del registro de auditoría (append-only).
 * Provee: Spec 2 (Ricardo). Consumen: specs 2, 3 y 4 en toda acción sensible.
 *
 * Reglas del contrato (constitución, principio I; docs/equipo/contratos.md §3):
 * - Solo inserta; no existe actualización ni borrado de eventos.
 * - Si se pasa `tx`, el evento se escribe en la misma transacción que la acción auditada.
 * - `datos` nunca incluye contraseñas, tokens, secretos 2FA ni datos completos de pago.
 */
import type { ClienteTransaccional } from './billetera.port.js';

export interface EventoAuditoria {
  /** Usuario que actúa; `null` para procesos del sistema (worker, liquidación). */
  readonly actorId: string | null;
  /** Verbo en pasado, p. ej. `apuesta.aceptada`, `partido.resultado_corregido`, `retiro.aprobado`. */
  readonly accion: string;
  readonly entidad: string;
  readonly entidadId: string | null;
  readonly datos?: Readonly<Record<string, unknown>>;
  readonly ip?: string;
  readonly dispositivo?: string;
}

export interface AuditoriaPort {
  registrar(evento: EventoAuditoria, tx?: ClienteTransaccional): Promise<void>;
}

export const AUDITORIA_PORT = Symbol('AUDITORIA_PORT');
