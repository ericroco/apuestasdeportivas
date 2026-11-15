import { Global, Module } from '@nestjs/common';
import { ActividadListener } from './actividad.listener.js';
import { ActividadService } from './actividad.service.js';
import { RegistroAlertasService } from './registro-alertas.service.js';

/**
 * Spec 4: actividad observada desde los eventos de dominio, alertas de fraude y riesgo de retiros. Es global para
 * que promociones registre alertas y el Spec 2 inyecte `RIESGO_PORT` con `@Optional()` (contrato 4).
 */
@Global()
@Module({
  providers: [ActividadService, ActividadListener, RegistroAlertasService],
  exports: [ActividadService, RegistroAlertasService],
})
export class FraudeModule {}
