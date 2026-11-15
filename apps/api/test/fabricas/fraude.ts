import type { Mock } from 'vitest';
import type { ConfigFraude, ContextoReglas } from '../../src/fraude/reglas/contexto.js';

export const AHORA_FRAUDE = new Date('2026-11-15T12:00:00Z');

export const CONFIG_FRAUDE: ConfigFraude = {
  FRAUDE_IP_MAX_CUENTAS: 3,
  FRAUDE_IP_VENTANA_HORAS: 24,
  FRAUDE_APUESTA_FACTOR: 10,
  FRAUDE_APUESTA_HISTORIAL_MIN: 5,
  FRAUDE_RAFAGA_MAX_APUESTAS: 10,
  FRAUDE_RAFAGA_VENTANA_SEG: 60,
  FRAUDE_RETIRO_VENTANA_HORAS: 24,
  FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT: 50,
};

export interface ContextoFalso {
  readonly contexto: ContextoReglas;
  readonly prisma: {
    actividadUsuario: Record<'findMany' | 'findFirst' | 'count' | 'aggregate', Mock>;
  };
  readonly actividad: { cuentasRelacionadas: Mock };
  readonly alertas: { registrar: Mock };
}

/** Dobles mínimos de las dependencias de las reglas; cada prueba ajusta los `mockResolvedValue` que necesita. */
export function crearContextoFalso(config: Partial<ConfigFraude> = {}): ContextoFalso {
  const prisma = {
    actividadUsuario: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi
        .fn()
        .mockResolvedValue({ _avg: { monto: null }, _sum: { monto: null }, _count: { _all: 0 } }),
    },
  };
  const actividad = {
    cuentasRelacionadas: vi
      .fn()
      .mockResolvedValue({ dispositivos: [], porDispositivo: [], porMetodoPago: [] }),
  };
  const alertas = { registrar: vi.fn().mockResolvedValue(true) };
  const contexto = {
    prisma,
    actividad,
    alertas,
    entorno: { ...CONFIG_FRAUDE, ...config },
    ahora: AHORA_FRAUDE,
  } as unknown as ContextoReglas;
  return { contexto, prisma, actividad, alertas };
}
