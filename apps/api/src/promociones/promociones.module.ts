import { Global, Module } from '@nestjs/common';
import { PROMOCIONES_APUESTA_PORT } from '../contracts/promociones.port.js';
import { BonosService } from './bonos.service.js';
import { CanjeService } from './canje.service.js';
import { CuponesController } from './cupones.controller.js';
import { CuponesService } from './cupones.service.js';
import { PromocionesApuestaAdapter } from './promociones-apuesta.adapter.js';
import { VistaPreviaController } from './vista-previa.controller.js';
import { VistaPreviaService } from './vista-previa.service.js';

/**
 * Spec 4: cupones, canjes, bonos y rollover. Es global para que el Spec 3 inyecte `PROMOCIONES_APUESTA_PORT` con
 * `@Optional()` sin importar este módulo (contrato 4).
 */
@Global()
@Module({
  controllers: [CuponesController, VistaPreviaController],
  providers: [
    CuponesService,
    CanjeService,
    BonosService,
    VistaPreviaService,
    PromocionesApuestaAdapter,
    { provide: PROMOCIONES_APUESTA_PORT, useExisting: PromocionesApuestaAdapter },
  ],
  exports: [PROMOCIONES_APUESTA_PORT],
})
export class PromocionesModule {}
