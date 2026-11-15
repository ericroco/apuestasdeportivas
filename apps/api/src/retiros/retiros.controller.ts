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
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import { ClienteActual, type ClienteHttp } from '../identidad/http/cliente-http.js';
import { RetirosService } from './retiros.service.js';

const codigo2fa = z
  .string({ error: 'Escribe tu código del segundo factor.' })
  .trim()
  .regex(/^(\d{6}|[A-Za-z0-9]{10})$/, 'Escribe tu código del segundo factor.');

const esquemaSolicitud = z
  .object({
    monto: z
      .string({ error: 'Escribe el monto.' })
      .trim()
      .regex(/^\d{1,7}(\.\d{1,2})?$/, 'Escribe un monto como 25 o 25.50.'),
    metodoPagoId: z.uuid({ error: 'Elige el destino del retiro.' }),
    codigo2fa,
    claveSolicitud: z.uuid(),
  })
  .strict();

const esquemaAprobacion = z.object({ codigo2fa }).strict();
const esquemaRechazo = z
  .object({
    motivo: z.string().trim().min(5, 'Explica el motivo del rechazo.').max(500),
    codigo2fa,
  })
  .strict();

@Controller('retiros')
@Roles('APOSTADOR')
export class RetirosController {
  constructor(private readonly retiros: RetirosService) {}

  @Post()
  solicitar(
    @Body({ schema: esquemaSolicitud }) datos: z.infer<typeof esquemaSolicitud>,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ) {
    return this.retiros.solicitar(usuario, datos, cliente);
  }

  @Get()
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.retiros.listarPropios(usuario.id);
  }

  @Get('metodos')
  metodos(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.retiros.metodos(usuario.id);
  }
}

/** HU8: revisión de retiros (solo administrador, con su código 2FA). */
@Controller('admin/retiros')
@Roles('ADMINISTRADOR')
export class RetirosAdminController {
  constructor(private readonly retiros: RetirosService) {}

  @Get()
  pendientes() {
    return this.retiros.pendientes();
  }

  @Post(':id/aprobacion')
  @HttpCode(HttpStatus.OK)
  aprobar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: esquemaAprobacion }) datos: z.infer<typeof esquemaAprobacion>,
    @UsuarioActual() admin: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ) {
    return this.retiros.aprobar(admin, id, datos.codigo2fa, cliente);
  }

  @Post(':id/rechazo')
  @HttpCode(HttpStatus.OK)
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: esquemaRechazo }) datos: z.infer<typeof esquemaRechazo>,
    @UsuarioActual() admin: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ) {
    return this.retiros.rechazar(admin, id, datos.motivo, datos.codigo2fa, cliente);
  }
}
