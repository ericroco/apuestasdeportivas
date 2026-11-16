import type { ConsumoProveedorDto } from '@apuestas/shared';
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../contracts/index.js';
import { PresupuestoService } from './presupuesto.service.js';

/** Consumo del presupuesto diario del proveedor y aviso de agotado para el operador (FR-010). */
@Controller('operador/proveedor')
@Roles('OPERADOR', 'ADMINISTRADOR')
export class ProveedorController {
  constructor(private readonly presupuesto: PresupuestoService) {}

  @Get('consumo')
  consumo(): Promise<ConsumoProveedorDto> {
    return this.presupuesto.consumo();
  }
}
