import { Module } from '@nestjs/common';
import { DepositosService } from './depositos.service.js';
import { PagosController } from './pagos.controller.js';
import { PASARELA_PORT } from './pasarela.port.js';
import { PayphoneCliente } from './payphone.cliente.js';

@Module({
  controllers: [PagosController],
  providers: [
    DepositosService,
    PayphoneCliente,
    { provide: PASARELA_PORT, useExisting: PayphoneCliente },
  ],
  exports: [PASARELA_PORT],
})
export class PagosModule {}
