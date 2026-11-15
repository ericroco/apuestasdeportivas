import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  Publico,
  Roles,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../contracts/autenticacion.js';
import { ClienteActual, type ClienteHttp } from '../identidad/http/cliente-http.js';
import { DepositosService, type EstadoDeposito } from './depositos.service.js';

const esquemaDeposito = z
  .object({
    monto: z
      .string({ error: 'Escribe el monto.' })
      .trim()
      .regex(/^\d{1,7}(\.\d{1,2})?$/, 'Escribe un monto como 25 o 25.50.'),
    codigoCupon: z.string().trim().max(40).optional(),
  })
  .strict();

const esquemaConfirmacion = z
  .object({ id: z.coerce.number().int().positive(), clientTransactionId: z.uuid() })
  .strict();

@Controller('pagos')
export class PagosController {
  constructor(private readonly depositos: DepositosService) {}

  @Post('depositos')
  @Roles('APOSTADOR')
  iniciar(
    @Body({ schema: esquemaDeposito }) datos: z.infer<typeof esquemaDeposito>,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<{ intencionId: string; urlPago: string }> {
    return this.depositos.iniciar(usuario, datos, cliente);
  }

  /** Pública: la autoridad es Payphone (FR-047). Limitada porque cada llamada consulta a Payphone con nuestro token. */
  @Post('depositos/confirmar')
  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  confirmar(
    @Body({ schema: esquemaConfirmacion }) datos: z.infer<typeof esquemaConfirmacion>,
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<EstadoDeposito> {
    return this.depositos.confirmar(datos.id, datos.clientTransactionId, cliente);
  }

  @Get('depositos/:id')
  @Roles('APOSTADOR')
  consultar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<EstadoDeposito> {
    return this.depositos.consultar(usuario.id, id);
  }
}
