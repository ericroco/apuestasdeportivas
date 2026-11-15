import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OPCIONES_LISTENER, ejecutarSinPropagar } from '../comun/eventos.js';
import { EVENTOS, type MapaEventos } from '../contracts/eventos.js';
import {
  desdeApuestaAceptada,
  desdeApuestaLiquidada,
  desdeDepositoConfirmado,
  desdeRetiroSolicitado,
  desdeUsuarioRegistrado,
  type EntradaActividad,
} from './actividad.mapeo.js';
import { ActividadService } from './actividad.service.js';
import type {
  ApuestaAceptadaExtendida,
  DepositoConfirmadoExtendido,
} from './eventos-extendidos.js';

/**
 * Llena `actividad_usuario` con los cinco eventos de dominio (contrato 5), una fila por evento aunque llegue
 * repetido. Un error se registra y no llega al emisor. Las reglas de fraude se evalúan sobre esta actividad.
 */
@Injectable()
export class ActividadListener {
  private readonly logger = new Logger(ActividadListener.name);

  constructor(private readonly actividad: ActividadService) {}

  @OnEvent(EVENTOS.usuarioRegistrado, OPCIONES_LISTENER)
  async alRegistrarUsuario(evento: MapaEventos['usuario.registrado']): Promise<void> {
    await this.registrar(EVENTOS.usuarioRegistrado, () => desdeUsuarioRegistrado(evento));
  }

  @OnEvent(EVENTOS.depositoConfirmado, OPCIONES_LISTENER)
  async alConfirmarDeposito(evento: DepositoConfirmadoExtendido): Promise<void> {
    await this.registrar(EVENTOS.depositoConfirmado, () => desdeDepositoConfirmado(evento));
  }

  @OnEvent(EVENTOS.retiroSolicitado, OPCIONES_LISTENER)
  async alSolicitarRetiro(evento: MapaEventos['retiro.solicitado']): Promise<void> {
    await this.registrar(EVENTOS.retiroSolicitado, () => desdeRetiroSolicitado(evento));
  }

  @OnEvent(EVENTOS.apuestaAceptada, OPCIONES_LISTENER)
  async alAceptarApuesta(evento: ApuestaAceptadaExtendida): Promise<void> {
    await this.registrar(EVENTOS.apuestaAceptada, () => desdeApuestaAceptada(evento));
  }

  @OnEvent(EVENTOS.apuestaLiquidada, OPCIONES_LISTENER)
  async alLiquidarApuesta(evento: MapaEventos['apuesta.liquidada']): Promise<void> {
    await this.registrar(EVENTOS.apuestaLiquidada, () => desdeApuestaLiquidada(evento));
  }

  private registrar(evento: string, mapear: () => EntradaActividad): Promise<void> {
    return ejecutarSinPropagar(this.logger, evento, () => this.actividad.registrar(mapear()));
  }
}
