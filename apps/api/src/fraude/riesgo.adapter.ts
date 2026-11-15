import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import type { Monto } from '../contracts/billetera.port.js';
import type { EvaluacionRiesgo, RiesgoPort } from '../contracts/promociones.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActividadService } from './actividad.service.js';
import { RegistroAlertasService } from './registro-alertas.service.js';
import type { ContextoReglas } from './reglas/contexto.js';
import { evaluarRetiroTrasDeposito } from './reglas/retiro.js';

export const MOTIVO_SIN_ACTIVIDAD = 'retiro_tras_deposito_sin_actividad';
export const MOTIVO_ALERTA_ALTA = 'usuario_con_alerta_de_fraude';
export const MOTIVO_NO_DISPONIBLE = 'evaluacion_no_disponible';

/**
 * `RIESGO_PORT` (contrato 4): dice al Spec 2 si un retiro debe ir a revisión manual (FR-021, FR-024). Falla cerrada:
 * ante cualquier error responde "requiere revisión", nunca aprueba por defecto.
 */
@Injectable()
export class RiesgoAdapter implements RiesgoPort {
  private readonly logger = new Logger(RiesgoAdapter.name);
  private readonly reloj: Reloj;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actividad: ActividadService,
    private readonly alertas: RegistroAlertasService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  async evaluarRetiro(usuarioId: string, monto: Monto): Promise<EvaluacionRiesgo> {
    try {
      return await this.evaluar(usuarioId, monto);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo evaluar el riesgo del retiro; se envía a revisión: ${mensaje}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { requiereRevision: true, motivos: [MOTIVO_NO_DISPONIBLE] };
    }
  }

  private async evaluar(usuarioId: string, monto: Monto): Promise<EvaluacionRiesgo> {
    const contexto: ContextoReglas = {
      prisma: this.prisma,
      actividad: this.actividad,
      alertas: this.alertas,
      entorno: this.entorno,
      ahora: this.reloj.ahora(),
    };
    const motivos: string[] = [];
    if (await evaluarRetiroTrasDeposito(contexto, usuarioId, monto)) {
      motivos.push(MOTIVO_SIN_ACTIVIDAD);
    }
    // Se consulta después de la regla: la alerta ALTA recién creada ya cuenta como vigente.
    if (await this.alertas.tieneAlertaAltaVigente(usuarioId)) motivos.push(MOTIVO_ALERTA_ALTA);
    return { requiereRevision: motivos.length > 0, motivos };
  }
}
