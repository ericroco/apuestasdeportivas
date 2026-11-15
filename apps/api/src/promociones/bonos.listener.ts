import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OPCIONES_LISTENER, ejecutarSinPropagar } from '../comun/eventos.js';
import { EVENTOS, type MapaEventos } from '../contracts/eventos.js';
import { desdeApuestaLiquidada, desdeDepositoConfirmado } from '../fraude/actividad.mapeo.js';
import { ActividadService } from '../fraude/actividad.service.js';
import type { DepositoConfirmadoExtendido } from '../fraude/eventos-extendidos.js';
import { BonosService } from './bonos.service.js';
import { RolloverService } from './rollover.service.js';

/**
 * Bono de depósito y rollover desde los eventos de dominio (contrato 5). Primero se asegura la actividad del evento
 * (idempotente, también la registra `ActividadListener`) y después se aplica el efecto, que es idempotente por sí
 * mismo. Un error se registra y no llega al emisor.
 */
@Injectable()
export class BonosListener {
  private readonly logger = new Logger(BonosListener.name);

  constructor(
    private readonly actividad: ActividadService,
    private readonly bonos: BonosService,
    private readonly rollover: RolloverService,
  ) {}

  @OnEvent(EVENTOS.depositoConfirmado, OPCIONES_LISTENER)
  async alConfirmarDeposito(evento: DepositoConfirmadoExtendido): Promise<void> {
    const contexto = `depositoId=${evento.depositoId} usuarioId=${evento.usuarioId}`;
    await ejecutarSinPropagar(
      this.logger,
      EVENTOS.depositoConfirmado,
      () => this.otorgarBonoDelDeposito(evento),
      { contexto },
    );
  }

  /** Idempotente (único `(origen, referencia_id)`): `ejecutarSinPropagar` lo reintenta ante fallas transitorias. */
  private async otorgarBonoDelDeposito(evento: DepositoConfirmadoExtendido): Promise<void> {
    const entrada = desdeDepositoConfirmado(evento);
    await this.actividad.registrar(entrada);
    if (typeof evento.codigoCupon !== 'string' || !entrada.monto) return;
    const resultado = await this.bonos.otorgarPorDeposito({
      usuarioId: entrada.usuarioId,
      depositoId: entrada.referenciaId,
      monto: entrada.monto,
      codigoCupon: evento.codigoCupon,
      metodoPagoHuella: entrada.metodoPagoHuella ?? null,
    });
    this.logger.log(`Cupón del depósito ${entrada.referenciaId}: ${resultado}`);
  }

  @OnEvent(EVENTOS.apuestaLiquidada, OPCIONES_LISTENER)
  async alLiquidarApuesta(evento: MapaEventos['apuesta.liquidada']): Promise<void> {
    await ejecutarSinPropagar(
      this.logger,
      EVENTOS.apuestaLiquidada,
      async () => {
        const entrada = desdeApuestaLiquidada(evento);
        await this.actividad.registrar(entrada);
        await this.rollover.recalcular(entrada.usuarioId);
      },
      { contexto: `apuestaId=${evento.apuestaId} usuarioId=${evento.usuarioId}` },
    );
  }
}
