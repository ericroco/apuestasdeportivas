import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUDITORIA_PORT } from '../../src/contracts/auditoria.port.js';
import { BILLETERA_PORT } from '../../src/contracts/billetera.port.js';
import { AuditoriaEnMemoria } from './auditoria-en-memoria.js';
import { BilleteraEnMemoria } from './billetera-en-memoria.js';
import { GuardDePrueba } from './guard-de-prueba.js';

export interface OpcionesDobles {
  /** Sin billetera ni auditoría se prueba la falla cerrada (503). Por defecto ambas están. */
  readonly billetera?: BilleteraEnMemoria | null;
  readonly auditoria?: AuditoriaEnMemoria | null;
}

/**
 * Módulo global que ocupa el lugar del Spec 2 en las pruebas e2e: guard que fija `request.user` desde cabeceras
 * y, si se piden, la billetera y la auditoría en memoria.
 */
@Module({})
export class DoblesSpec2Module {
  static registrar(opciones: OpcionesDobles = {}): DynamicModule {
    const billetera =
      opciones.billetera === undefined ? new BilleteraEnMemoria() : opciones.billetera;
    const auditoria =
      opciones.auditoria === undefined ? new AuditoriaEnMemoria() : opciones.auditoria;
    const puertos: Array<{ provide: symbol; useValue: unknown }> = [];
    if (billetera) puertos.push({ provide: BILLETERA_PORT, useValue: billetera });
    if (auditoria) puertos.push({ provide: AUDITORIA_PORT, useValue: auditoria });
    const guard: Provider = { provide: APP_GUARD, useClass: GuardDePrueba };
    return {
      module: DoblesSpec2Module,
      global: true,
      providers: [guard, ...puertos],
      exports: puertos.map(({ provide }) => provide),
    };
  }
}
