import {
  ESPACIO_TIEMPO_REAL,
  EVENTOS_TIEMPO_REAL,
  type TicketTiempoRealDto,
} from '@apuestas/shared';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '@/lib/api-cliente';

/**
 * Tiempo real del Spec 3 (contracts/tiempo-real.md). La conexión de Socket.IO es lo único que va directo a la API;
 * el ticket de un solo uso se pide por el proxy de la web en cada conexión y reconexión (contrato 6).
 */

const URL_TIEMPO_REAL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

export function conectarTiempoReal(): Socket {
  return io(URL_TIEMPO_REAL + ESPACIO_TIEMPO_REAL, {
    transports: ['websocket'],
    auth: (enviar) => {
      api<TicketTiempoRealDto>('/tiempo-real/ticket', { metodo: 'POST' })
        .then(({ ticket }) => enviar({ ticket }))
        // Sin ticket la API rechaza la conexión: la pantalla sigue funcionando sin avisos en vivo.
        .catch(() => enviar({}));
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada evento tiene su propio payload tipado
type Manejadores = Partial<Record<string, (payload: any) => void>>;

/**
 * Se conecta mientras el componente está montado, sigue los partidos indicados y llama a los manejadores con cada
 * mensaje. Los manejadores se leen de una referencia, así que pueden cambiar sin reconectar.
 */
export function useTiempoReal(manejadores: Manejadores, partidos: readonly string[] = []): void {
  const actuales = useRef(manejadores);
  useEffect(() => {
    actuales.current = manejadores;
  });
  const clave = partidos.join(',');

  useEffect(() => {
    const socket = conectarTiempoReal();
    const seguidos = clave ? clave.split(',') : [];
    socket.on('connect', () => {
      for (const partidoId of seguidos)
        socket.emit(EVENTOS_TIEMPO_REAL.partidoSeguir, { partidoId });
    });
    socket.onAny((evento: string, payload: unknown) => {
      actuales.current[evento]?.(payload);
    });
    return () => {
      socket.disconnect();
    };
  }, [clave]);
}
