import type { AlertaFraude } from '../generated/prisma/client.js';

/** Alerta como la devuelve la API (contracts/api-rest.md): fechas en ISO 8601. */
export interface VistaAlerta {
  readonly id: string;
  readonly regla: AlertaFraude['regla'];
  readonly severidad: AlertaFraude['severidad'];
  readonly usuarioId: string;
  readonly evidencia: unknown;
  readonly estado: AlertaFraude['estado'];
  readonly nota: string | null;
  readonly resueltaPor: string | null;
  readonly resueltaEn: string | null;
  readonly creadaEn: string;
}

export function aVistaAlerta(alerta: AlertaFraude): VistaAlerta {
  return {
    id: alerta.id,
    regla: alerta.regla,
    severidad: alerta.severidad,
    usuarioId: alerta.usuarioId,
    evidencia: alerta.evidencia,
    estado: alerta.estado,
    nota: alerta.nota,
    resueltaPor: alerta.resueltaPor,
    resueltaEn: alerta.resueltaEn?.toISOString() ?? null,
    creadaEn: alerta.creadaEn.toISOString(),
  };
}
