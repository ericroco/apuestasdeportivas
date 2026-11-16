import type { EstadoPartido } from '@apuestas/shared';
import { BadRequestException } from '@nestjs/common';
import type { ActualizacionPartido } from '../partidos/partidos.service.js';
import type {
  CuotasPartidoProveedor,
  PartidoProveedor,
  ProveedorDeportivo,
} from './proveedor-deportivo.port.js';

export const TIPOS_EVENTO_SIMULADO = [
  'INICIO',
  'GOL',
  'SUSPENSION',
  'REANUDACION',
  'APLAZAMIENTO',
  'FINAL',
  'CANCELACION',
] as const;
export type TipoEventoSimulado = (typeof TIPOS_EVENTO_SIMULADO)[number];

export interface EventoSimulado {
  readonly tipo: TipoEventoSimulado;
  readonly equipo?: 'LOCAL' | 'VISITANTE';
  readonly minuto?: number;
}

interface MarcadorActual {
  readonly estado: EstadoPartido;
  readonly golesLocal: number | null;
  readonly golesVisitante: number | null;
  readonly minuto: number | null;
}

const ESTADO_POR_EVENTO: Readonly<Partial<Record<TipoEventoSimulado, EstadoPartido>>> = {
  SUSPENSION: 'SUSPENDIDO',
  REANUDACION: 'EN_VIVO',
  APLAZAMIENTO: 'APLAZADO',
  FINAL: 'FINALIZADO',
  CANCELACION: 'CANCELADO',
};

/**
 * Traduce un evento que el operador simula a la misma ActualizacionPartido que produce el proveedor real:
 * así el partido simulado recorre el mismo camino hasta la liquidación (FR-013).
 */
export function traducirEventoSimulado(
  partido: MarcadorActual,
  evento: EventoSimulado,
): ActualizacionPartido {
  const motivo = `simulación: ${evento.tipo}`;
  const minuto = evento.minuto !== undefined ? { minuto: evento.minuto } : {};

  if (evento.tipo === 'INICIO') {
    return {
      estado: 'EN_VIVO',
      golesLocal: 0,
      golesVisitante: 0,
      minuto: evento.minuto ?? 0,
      motivo,
    };
  }
  if (evento.tipo === 'GOL') {
    if (!evento.equipo) throw new BadRequestException('Indica qué equipo marcó el gol');
    const local = partido.golesLocal ?? 0;
    const visitante = partido.golesVisitante ?? 0;
    return {
      golesLocal: evento.equipo === 'LOCAL' ? local + 1 : local,
      golesVisitante: evento.equipo === 'VISITANTE' ? visitante + 1 : visitante,
      ...minuto,
      motivo,
    };
  }
  return { estado: ESTADO_POR_EVENTO[evento.tipo] as EstadoPartido, ...minuto, motivo };
}

/**
 * Adaptador del modo simulación (API_FOOTBALL_SIMULACION=true): no consulta ninguna red ni gasta
 * presupuesto. Los partidos se mueven con los eventos del operador (SimulacionController).
 */
export class SimuladorProveedor implements ProveedorDeportivo {
  readonly esSimulacion = true;

  partidosDelDia(_fecha: string): Promise<PartidoProveedor[]> {
    return Promise.resolve([]);
  }

  partidosEnVivo(): Promise<PartidoProveedor[]> {
    return Promise.resolve([]);
  }

  partidosPorId(_ids: readonly number[]): Promise<PartidoProveedor[]> {
    return Promise.resolve([]);
  }

  cuotasDePartido(_idProveedorPartido: number): Promise<CuotasPartidoProveedor | null> {
    return Promise.resolve(null);
  }
}
