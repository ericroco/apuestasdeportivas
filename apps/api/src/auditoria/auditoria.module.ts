import { Global, Module } from '@nestjs/common';
import { AUDITORIA_PORT } from '../contracts/auditoria.port.js';
import { AuditoriaController } from './auditoria.controller.js';
import { AuditoriaService } from './auditoria.service.js';

/** Global: todos los specs inyectan AUDITORIA_PORT sin importar este módulo (contrato 3). */
@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService, { provide: AUDITORIA_PORT, useExisting: AuditoriaService }],
  exports: [AuditoriaService, AUDITORIA_PORT],
})
export class AuditoriaModule {}
