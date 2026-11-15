import { Global, Module } from '@nestjs/common';
import { CuponesController } from './cupones.controller.js';
import { CuponesService } from './cupones.service.js';

/**
 * Spec 4: cupones, canjes, bonos y rollover. Es global para que el Spec 3 inyecte `PROMOCIONES_APUESTA_PORT` con
 * `@Optional()` sin importar este módulo (contrato 4).
 */
@Global()
@Module({
  controllers: [CuponesController],
  providers: [CuponesService],
})
export class PromocionesModule {}
