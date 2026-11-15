import type { AuditoriaPort, EventoAuditoria } from '../../src/contracts/auditoria.port.js';
import type { ClienteTransaccional } from '../../src/contracts/billetera.port.js';

export interface RegistroAuditoria {
  readonly evento: EventoAuditoria;
  /** `true` si se registró dentro de la transacción de la acción auditada. */
  readonly enTransaccion: boolean;
}

/** Doble en memoria de `AuditoriaPort` (contrato 3): solo agrega eventos. */
export class AuditoriaEnMemoria implements AuditoriaPort {
  private readonly registro: RegistroAuditoria[] = [];

  get eventos(): readonly RegistroAuditoria[] {
    return [...this.registro];
  }

  acciones(): string[] {
    return this.registro.map(({ evento }) => evento.accion);
  }

  async registrar(evento: EventoAuditoria, tx?: ClienteTransaccional): Promise<void> {
    this.registro.push({ evento, enTransaccion: tx !== undefined });
  }
}
