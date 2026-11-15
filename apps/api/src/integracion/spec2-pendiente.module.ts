import { Global, Logger, Module, ServiceUnavailableException } from '@nestjs/common';
import { ENTORNO, type Entorno } from '../config/env.js';
import {
  AUDITORIA_PORT,
  type AuditoriaPort,
  BILLETERA_PORT,
  type BilleteraPort,
  type EventoAuditoria,
} from '../contracts/index.js';

/**
 * Reemplazos de BILLETERA_PORT y AUDITORIA_PORT mientras el Spec 2 no esté en develop (tasks.md T013).
 * BORRAR este módulo y su import en app.module.ts cuando el Spec 2 provea los puertos reales.
 *
 * - Billetera: falla cerrada. Sin billetera no se mueve dinero: toda operación responde 503.
 * - Auditoría: en desarrollo y pruebas escribe el evento en el log con un aviso; en producción falla cerrada,
 *   porque una acción sensible sin auditoría viola la constitución (principio I).
 */
const billeteraNoDisponible = (): never => {
  throw new ServiceUnavailableException('Billetera no disponible: el Spec 2 aún no está integrado');
};

const billeteraPendiente: BilleteraPort = {
  debitarApuesta: billeteraNoDisponible,
  acreditarPremio: billeteraNoDisponible,
  reembolsarApuesta: billeteraNoDisponible,
  acreditarBono: billeteraNoDisponible,
  convertirBonoEnReal: billeteraNoDisponible,
  obtenerSaldos: billeteraNoDisponible,
};

export function crearAuditoriaPendiente(entorno: Pick<Entorno, 'NODE_ENV'>): AuditoriaPort {
  const logger = new Logger('AuditoriaPendiente');
  return {
    registrar(evento: EventoAuditoria): Promise<void> {
      if (entorno.NODE_ENV === 'production') {
        return Promise.reject(
          new ServiceUnavailableException(
            'Auditoría no disponible: el Spec 2 aún no está integrado',
          ),
        );
      }
      logger.warn(
        `[sin auditoría real] ${evento.accion} ${evento.entidad}:${evento.entidadId ?? '-'} ` +
          `actor=${evento.actorId ?? 'sistema'}`,
      );
      return Promise.resolve();
    },
  };
}

@Global()
@Module({
  providers: [
    { provide: BILLETERA_PORT, useValue: billeteraPendiente },
    { provide: AUDITORIA_PORT, inject: [ENTORNO], useFactory: crearAuditoriaPendiente },
  ],
  exports: [BILLETERA_PORT, AUDITORIA_PORT],
})
export class Spec2PendienteModule {}
