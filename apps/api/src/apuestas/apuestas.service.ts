import type { ApuestaDto, Pagina } from '@apuestas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { aApuestaDto, INCLUIR_SELECCIONES } from './apuestas.mapeo.js';
import type { ConsultaApuestas } from './apuestas.esquemas.js';

/** "Mis apuestas" (FR-023): cada apostador ve solo las suyas. */
@Injectable()
export class ApuestasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(usuarioId: string, consulta: ConsultaApuestas): Promise<Pagina<ApuestaDto>> {
    const where: Prisma.ApuestaWhereInput = {
      usuarioId,
      ...(consulta.estado ? { estado: consulta.estado } : {}),
    };
    const [total, apuestas] = await this.prisma.$transaction([
      this.prisma.apuesta.count({ where }),
      this.prisma.apuesta.findMany({
        where,
        include: INCLUIR_SELECCIONES,
        orderBy: [{ aceptadaEn: 'desc' }, { id: 'asc' }],
        skip: (consulta.pagina - 1) * consulta.porPagina,
        take: consulta.porPagina,
      }),
    ]);
    return {
      elementos: apuestas.map(aApuestaDto),
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
      total,
    };
  }

  /** Una apuesta ajena responde igual que una inexistente: no se revela que existe. */
  async obtener(usuarioId: string, id: string): Promise<ApuestaDto> {
    const apuesta = await this.prisma.apuesta.findFirst({
      where: { id, usuarioId },
      include: INCLUIR_SELECCIONES,
    });
    if (!apuesta) throw new NotFoundException('La apuesta no existe');
    return aApuestaDto(apuesta);
  }
}
