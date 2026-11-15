import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  ROLES,
  Roles,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../contracts/autenticacion.js';
import { ClienteActual, type ClienteHttp } from './http/cliente-http.js';
import { type FiltroUsuarios, UsuariosAdminService } from './usuarios-admin.service.js';

const esquemaFiltro = z
  .object({
    q: z.string().trim().max(120).optional(),
    estado: z.enum(['PENDIENTE_VERIFICACION', 'ACTIVO', 'SUSPENDIDO']).optional(),
    rol: z.enum(ROLES).optional(),
    cursor: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const esquemaRoles = z
  .object({
    roles: z.array(z.enum(ROLES)).min(1, 'El usuario debe tener al menos un rol.'),
    codigo2fa: z
      .string()
      .trim()
      .regex(/^(\d{6}|[A-Za-z0-9]{10})$/, 'Escribe tu código 2FA.'),
  })
  .strict();

const esquemaSuspension = z
  .object({ motivo: z.string().trim().min(5, 'Explica el motivo de la suspensión.').max(500) })
  .strict();

/** HU9: panel de usuarios del administrador (contracts/api-rest.md). */
@Controller('admin/usuarios')
@Roles('ADMINISTRADOR')
export class UsuariosAdminController {
  constructor(private readonly usuarios: UsuariosAdminService) {}

  @Get()
  listar(@Query({ schema: esquemaFiltro }) filtro: FiltroUsuarios) {
    return this.usuarios.listar(filtro);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.detalle(id);
  }

  @Put(':id/roles')
  cambiarRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: esquemaRoles }) datos: z.infer<typeof esquemaRoles>,
    @UsuarioActual() admin: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ) {
    return this.usuarios.cambiarRoles(admin.id, id, datos.roles, datos.codigo2fa, cliente);
  }

  @Post(':id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspender(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: esquemaSuspension }) { motivo }: { motivo: string },
    @UsuarioActual() admin: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<void> {
    return this.usuarios.suspender(admin.id, id, motivo, cliente);
  }

  @Delete(':id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  reactivar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() admin: UsuarioAutenticado,
    @ClienteActual() cliente: ClienteHttp,
  ): Promise<void> {
    return this.usuarios.reactivar(admin.id, id, cliente);
  }
}
