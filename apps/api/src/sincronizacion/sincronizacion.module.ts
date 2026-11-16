import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { COLAS } from '../colas/nombres.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { PartidosModule } from '../partidos/partidos.module.js';
import { ApiFootballProveedor } from './api-football.proveedor.js';
import { ImportacionService } from './importacion.service.js';
import { PresupuestoService } from './presupuesto.service.js';
import { ProveedorController } from './proveedor.controller.js';
import { PROVEEDOR_DEPORTIVO } from './proveedor-deportivo.port.js';
import { SimulacionController } from './simulacion.controller.js';
import { SimuladorProveedor } from './simulador.proveedor.js';
import { SincronizacionProcessor } from './sincronizacion.processor.js';

/** HU5: importación desde API-Football con presupuesto diario, y modo simulación. */
@Module({
  imports: [PartidosModule, BullModule.registerQueue({ name: COLAS.sincronizacion })],
  controllers: [SimulacionController, ProveedorController],
  providers: [
    PresupuestoService,
    ImportacionService,
    SincronizacionProcessor,
    {
      provide: PROVEEDOR_DEPORTIVO,
      inject: [ENTORNO, PresupuestoService],
      useFactory: (entorno: Entorno, presupuesto: PresupuestoService) =>
        entorno.API_FOOTBALL_SIMULACION
          ? new SimuladorProveedor()
          : new ApiFootballProveedor(entorno, presupuesto),
    },
  ],
  exports: [ImportacionService, PresupuestoService],
})
export class SincronizacionModule {}
