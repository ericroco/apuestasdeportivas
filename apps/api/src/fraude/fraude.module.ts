import { Global, Module } from '@nestjs/common';

/**
 * Spec 4: actividad observada desde los eventos de dominio, alertas de fraude y riesgo de retiros. Es global para
 * que promociones registre alertas y el Spec 2 inyecte `RIESGO_PORT` con `@Optional()` (contrato 4).
 */
@Global()
@Module({})
export class FraudeModule {}
