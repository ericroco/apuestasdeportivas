import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { RespuestaSalud } from '@apuestas/shared';
import type { Response } from 'express';
import { Publico } from '../contracts/autenticacion.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Pública y sin rate limiting: la consultan Render y la web en cada visita. */
  @Get()
  @Publico()
  @SkipThrottle()
  async obtener(@Res({ passthrough: true }) respuesta: Response): Promise<RespuestaSalud> {
    const salud = await this.health.comprobar();
    respuesta.status(salud.estado === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return salud;
  }
}
