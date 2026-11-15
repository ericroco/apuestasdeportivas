import { Global, Module } from '@nestjs/common';
import { BILLETERA_PORT } from '../contracts/billetera.port.js';
import { BilleteraController } from './billetera.controller.js';
import { BilleteraService } from './billetera.service.js';
import { LibroContableService } from './libro-contable.service.js';

/** Global: los specs 3 y 4 inyectan BILLETERA_PORT sin importar este módulo (contrato 2). */
@Global()
@Module({
  controllers: [BilleteraController],
  providers: [
    LibroContableService,
    BilleteraService,
    { provide: BILLETERA_PORT, useExisting: BilleteraService },
  ],
  exports: [LibroContableService, BilleteraService, BILLETERA_PORT],
})
export class BilleteraModule {}
