import { Global, Module } from '@nestjs/common';

/**
 * Spec 4: cupones, canjes, bonos y rollover. Es global para que el Spec 3 inyecte `PROMOCIONES_APUESTA_PORT` con
 * `@Optional()` sin importar este módulo (contrato 4).
 */
@Global()
@Module({})
export class PromocionesModule {}
