import {
  type ApuestaLiquidadaPayload,
  type ApuestaVivoResueltaPayload,
  EVENTOS_TIEMPO_REAL,
  type MercadoDto,
  type MercadoActualizadoPayload,
  type PartidoActualizadoPayload,
  type PartidoDetalleDto,
} from '@apuestas/shared';
import { Injectable } from '@nestjs/common';
import { salaPartido, salaUsuario, TiempoRealGateway } from './tiempo-real.gateway.js';

type SinEmision<T> = Omit<T, 'emitidoEn'>;

/**
 * Emite los mensajes del servidor (contracts/tiempo-real.md). Quien llama lo hace SOLO después del commit de
 * la transacción que origina el cambio. Cada mensaje lleva `emitidoEn` para medir la latencia (SC-001).
 * Hay una sola instancia de la API: la emisión es directa, sin adaptador Redis (YAGNI, research.md §9).
 */
@Injectable()
export class NotificadorService {
  constructor(private readonly gateway: TiempoRealGateway) {}

  partidoActualizado(partido: PartidoDetalleDto): void {
    const payload: SinEmision<PartidoActualizadoPayload> = {
      partidoId: partido.id,
      estado: partido.estado,
      golesLocal: partido.golesLocal,
      golesVisitante: partido.golesVisitante,
      minuto: partido.minuto,
      version: partido.version,
    };
    this.emitir(salaPartido(partido.id), EVENTOS_TIEMPO_REAL.partidoActualizado, payload);
  }

  mercadoActualizado(partidoId: string, mercado: MercadoDto): void {
    const payload: SinEmision<MercadoActualizadoPayload> = {
      partidoId,
      mercadoId: mercado.id,
      estado: mercado.estado,
      selecciones: mercado.selecciones.map(({ id, cuota }) => ({ id, cuota })),
    };
    this.emitir(salaPartido(partidoId), EVENTOS_TIEMPO_REAL.mercadoActualizado, payload);
  }

  /** Solo al dueño de la apuesta (FR-029). */
  apuestaLiquidada(usuarioId: string, payload: SinEmision<ApuestaLiquidadaPayload>): void {
    this.emitir(salaUsuario(usuarioId), EVENTOS_TIEMPO_REAL.apuestaLiquidada, payload);
  }

  apuestaVivoResuelta(usuarioId: string, payload: SinEmision<ApuestaVivoResueltaPayload>): void {
    this.emitir(salaUsuario(usuarioId), EVENTOS_TIEMPO_REAL.apuestaVivoResuelta, payload);
  }

  private emitir(sala: string, evento: string, payload: object): void {
    // Antes de que el gateway se inicialice (p. ej. un script sin servidor HTTP) no hay a quién avisar.
    this.gateway.servidor
      ?.to(sala)
      .emit(evento, { ...payload, emitidoEn: new Date().toISOString() });
  }
}
