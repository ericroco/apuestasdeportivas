import { Global, Module } from '@nestjs/common';
import { RIESGO_PORT } from '../contracts/promociones.port.js';
import { ActividadListener } from './actividad.listener.js';
import { ActividadService } from './actividad.service.js';
import { AlertasController } from './alertas.controller.js';
import { AlertasService } from './alertas.service.js';
import { EvaluadorFraudeService } from './evaluador-fraude.service.js';
import { RegistroAlertasService } from './registro-alertas.service.js';
import { RiesgoAdapter } from './riesgo.adapter.js';

/**
 * Spec 4: actividad observada desde los eventos de dominio, alertas de fraude y riesgo de retiros. Es global para
 * que promociones registre alertas y el Spec 2 inyecte `RIESGO_PORT` con `@Optional()` (contrato 4).
 */
@Global()
@Module({
  controllers: [AlertasController],
  providers: [
    AlertasService,
    ActividadService,
    ActividadListener,
    EvaluadorFraudeService,
    RegistroAlertasService,
    RiesgoAdapter,
    { provide: RIESGO_PORT, useExisting: RiesgoAdapter },
  ],
  exports: [ActividadService, RegistroAlertasService, RIESGO_PORT],
})
export class FraudeModule {}
