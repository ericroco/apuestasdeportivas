import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../contracts/autenticacion.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const esquemaFiltro = z
  .object({
    usuarioId: z.uuid().optional(),
    accion: z.string().trim().max(80).optional(),
    desde: z.iso.datetime({ offset: true }).optional(),
    hasta: z.iso.datetime({ offset: true }).optional(),
    cursor: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

type Filtro = z.infer<typeof esquemaFiltro>;

/** FR-033: consulta de la auditoría por usuario (como actor o como afectado), acción y fechas. Solo lectura. */
@Controller('admin/auditoria')
@Roles('ADMINISTRADOR')
export class AuditoriaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listar(@Query({ schema: esquemaFiltro }) filtro: Filtro) {
    const where: Prisma.EventoAuditoriaWhereInput = {
      ...(filtro.usuarioId
        ? {
            OR: [
              { actorId: filtro.usuarioId },
              { entidad: 'usuario', entidadId: filtro.usuarioId },
            ],
          }
        : {}),
      ...(filtro.accion ? { accion: { startsWith: filtro.accion } } : {}),
      ...(filtro.desde || filtro.hasta
        ? {
            creadoEn: {
              ...(filtro.desde ? { gte: new Date(filtro.desde) } : {}),
              ...(filtro.hasta ? { lte: new Date(filtro.hasta) } : {}),
            },
          }
        : {}),
    };
    const filas = await this.prisma.eventoAuditoria.findMany({
      where,
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: filtro.limite + 1,
      ...(filtro.cursor ? { cursor: { id: filtro.cursor }, skip: 1 } : {}),
    });
    const items = filas.slice(0, filtro.limite);
    return { items, siguiente: filas.length > filtro.limite ? (items.at(-1)?.id ?? null) : null };
  }
}
