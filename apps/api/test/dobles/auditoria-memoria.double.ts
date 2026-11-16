import type {
  AuditoriaPort,
  ClienteTransaccional,
  EventoAuditoria,
} from '../../src/contracts/index.js';

/**
 * Doble de AuditoriaPort que captura los eventos para las aserciones (research.md §12).
 * No participa en la transacción: un evento registrado dentro de una transacción que luego se revierte queda
 * igual en la lista. Para probar que un rechazo no audita nada, compruébalo con `porAccion()` vacío.
 */
export class AuditoriaEnMemoria implements AuditoriaPort {
  private readonly eventos: EventoAuditoria[] = [];

  registrar(evento: EventoAuditoria, _tx?: ClienteTransaccional): Promise<void> {
    this.eventos.push(Object.freeze({ ...evento }));
    return Promise.resolve();
  }

  todos(): readonly EventoAuditoria[] {
    return [...this.eventos];
  }

  porAccion(accion: string): readonly EventoAuditoria[] {
    return this.eventos.filter((evento) => evento.accion === accion);
  }

  limpiar(): void {
    this.eventos.length = 0;
  }
}
