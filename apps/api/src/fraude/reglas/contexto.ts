import type { Entorno } from '../../config/env.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ActividadService } from '../actividad.service.js';
import type { RegistroAlertasService } from '../registro-alertas.service.js';

/** Umbrales y ventanas de las reglas (`FRAUDE_*`, contracts/configuracion.md). */
export type ConfigFraude = Pick<
  Entorno,
  | 'FRAUDE_IP_MAX_CUENTAS'
  | 'FRAUDE_IP_VENTANA_HORAS'
  | 'FRAUDE_APUESTA_FACTOR'
  | 'FRAUDE_APUESTA_HISTORIAL_MIN'
  | 'FRAUDE_RAFAGA_MAX_APUESTAS'
  | 'FRAUDE_RAFAGA_VENTANA_SEG'
  | 'FRAUDE_RETIRO_VENTANA_HORAS'
  | 'FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT'
>;

/** Dependencias de una evaluación. Las reglas solo crean alertas: nunca bloquean el evento (FR-025). */
export interface ContextoReglas {
  readonly prisma: Pick<PrismaService, 'actividadUsuario'>;
  readonly actividad: Pick<ActividadService, 'cuentasRelacionadas'>;
  readonly alertas: Pick<RegistroAlertasService, 'registrar'>;
  readonly entorno: ConfigFraude;
  /** Hora del servidor de esta evaluación. */
  readonly ahora: Date;
}

export const MS_POR_HORA = 3_600_000;
