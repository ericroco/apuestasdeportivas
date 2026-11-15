import { Inject, Injectable, Optional } from '@nestjs/common';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EntradaActividad } from './actividad.mapeo.js';
import { ActividadService } from './actividad.service.js';
import { RegistroAlertasService } from './registro-alertas.service.js';
import { evaluarMontoAnomalo, evaluarRafaga } from './reglas/apuestas.js';
import type { ContextoReglas } from './reglas/contexto.js';
import {
  evaluarCuentasPorDispositivo,
  evaluarCuentasPorIp,
  evaluarMetodoPagoCompartido,
} from './reglas/cuentas-multiples.js';

type Regla = (contexto: ContextoReglas, entrada: EntradaActividad) => Promise<void>;

const REGLAS_POR_TIPO: Readonly<Partial<Record<EntradaActividad['tipo'], readonly Regla[]>>> = {
  REGISTRO: [evaluarCuentasPorDispositivo, evaluarCuentasPorIp],
  DEPOSITO: [evaluarMetodoPagoCompartido],
  APUESTA_ACEPTADA: [evaluarMontoAnomalo, evaluarRafaga],
};

/**
 * Evalúa las reglas de fraude sobre una actividad recién registrada. Solo crea alertas: nunca bloquea ni revierte
 * el evento (FR-025). Una regla que falla no impide que se evalúen las demás.
 */
@Injectable()
export class EvaluadorFraudeService {
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

  /** Lanza el primer error de las reglas, después de haber intentado todas. */
  async evaluar(entrada: EntradaActividad): Promise<void> {
    const reglas = REGLAS_POR_TIPO[entrada.tipo] ?? [];
    const contexto: ContextoReglas = {
      prisma: this.prisma,
      actividad: this.actividad,
      alertas: this.alertas,
      entorno: this.entorno,
      ahora: this.reloj.ahora(),
    };
    const resultados = await Promise.allSettled(reglas.map((regla) => regla(contexto, entrada)));
    const fallida = resultados.find((resultado) => resultado.status === 'rejected');
    if (fallida) throw fallida.reason;
  }
}
