import { Injectable } from '@nestjs/common';
import type { AuditoriaPort, EventoAuditoria } from '../contracts/auditoria.port.js';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { sanitizarDatos } from './sanitizar.js';

/** Largo máximo del dispositivo (User-Agent) guardado: evita filas enormes con cabeceras manipuladas. */
const LARGO_MAXIMO_DISPOSITIVO = 300;

/**
 * Implementación de AUDITORIA_PORT (contrato 3). Solo inserta: la tabla rechaza UPDATE, DELETE y TRUNCATE.
 * Con `tx`, el evento se confirma o se revierte junto con la acción auditada (FR-032).
 */
@Injectable()
export class AuditoriaService implements AuditoriaPort {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(evento: EventoAuditoria, tx?: ClienteTransaccional): Promise<void> {
    const cliente = tx ?? this.prisma;
    const datos = sanitizarDatos(evento.datos);
    await cliente.eventoAuditoria.create({
      data: {
        actorId: evento.actorId,
        accion: evento.accion,
        entidad: evento.entidad,
        entidadId: evento.entidadId,
        ...(datos === undefined ? {} : { datos: datos as Prisma.InputJsonObject }),
        ip: evento.ip ?? null,
        dispositivo: evento.dispositivo?.slice(0, LARGO_MAXIMO_DISPOSITIVO) ?? null,
      },
    });
  }
}
