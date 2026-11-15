import type { PartidoDetalleDto } from '@apuestas/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ContextoAccion } from '../comun/contexto-accion.js';
import { aTexto, type Decimal } from '../comun/decimal.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import {
  AUDITORIA_PORT,
  type AuditoriaPort,
  type ClienteTransaccional,
} from '../contracts/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { admiteApuestas, esEstadoFinal } from './maquina-estados.js';
import { validarMercado } from './mercados.js';
import type { CrearMercado } from './partidos.esquemas.js';
import { ahoraServidor, bloquearPartido, PartidosService } from './partidos.service.js';

/** Mercados, selecciones y cuotas de un partido (FR-003, FR-005, FR-006). */
@Injectable()
export class MercadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partidos: PartidosService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
  ) {}

  async crearMercado(
    partidoId: string,
    datos: CrearMercado,
    contexto: ContextoAccion,
  ): Promise<PartidoDetalleDto> {
    const linea = datos.linea ?? null;
    validarMercado({ tipo: datos.tipo, linea, selecciones: datos.selecciones });

    return this.prisma.$transaction(async (tx) => {
      // El bloqueo del partido serializa las altas: PostgreSQL no considera duplicadas dos líneas NULL.
      const partido = await bloquearPartido(tx, partidoId);
      if (esEstadoFinal(partido.estado)) {
        throw new ConflictException('No se pueden agregar mercados a un partido terminado');
      }
      const existente = await tx.mercado.findFirst({
        where: { partidoId, tipo: datos.tipo, linea },
      });
      if (existente) throw new ConflictException('El partido ya tiene ese mercado');

      const mercado = await tx.mercado.create({
        data: {
          partidoId,
          tipo: datos.tipo,
          linea,
          admiteVivo: datos.admiteVivo,
          gestionadoPorOperador: contexto.origen === 'OPERADOR',
          selecciones: {
            create: datos.selecciones.map(({ codigo, cuota }) => ({ codigo, cuota })),
          },
        },
        include: { selecciones: true },
      });
      await tx.historialCuota.createMany({
        data: mercado.selecciones.map((seleccion) => ({
          seleccionId: seleccion.id,
          cuotaNueva: seleccion.cuota,
          actorId: contexto.actorId,
          origen: contexto.origen,
        })),
      });
      await tx.partido.update({ where: { id: partidoId }, data: { version: { increment: 1 } } });
      await this.auditar(tx, contexto, 'mercado.creado', mercado.id, {
        partidoId,
        tipo: mercado.tipo,
        linea,
        admiteVivo: mercado.admiteVivo,
        selecciones: datos.selecciones,
      });
      return this.partidos.obtener(partidoId, tx);
    });
  }

  /**
   * Cambia la cuota de una selección. Solo afecta a las apuestas nuevas: las aceptadas tienen su cuota
   * congelada. Marca el mercado como gestionado por el operador para que la importación no la pise (FR-006).
   */
  async cambiarCuota(
    seleccionId: string,
    cuota: Decimal,
    contexto: ContextoAccion,
  ): Promise<PartidoDetalleDto> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM seleccion WHERE id = ${seleccionId}::uuid FOR UPDATE`;
      const seleccion = await tx.seleccion.findUnique({
        where: { id: seleccionId },
        include: { mercado: { include: { partido: true } } },
      });
      if (!seleccion) throw new NotFoundException('La selección no existe');
      const { mercado } = seleccion;
      if (mercado.estado === 'CERRADO' || esEstadoFinal(mercado.partido.estado)) {
        throw new ErrorNegocio(
          'MERCADO_CERRADO',
          'No se puede cambiar la cuota de un mercado cerrado',
        );
      }

      await tx.seleccion.update({ where: { id: seleccionId }, data: { cuota } });
      await tx.historialCuota.create({
        data: {
          seleccionId,
          cuotaAnterior: seleccion.cuota,
          cuotaNueva: cuota,
          actorId: contexto.actorId,
          origen: contexto.origen,
        },
      });
      if (contexto.origen === 'OPERADOR' && !mercado.gestionadoPorOperador) {
        await tx.mercado.update({
          where: { id: mercado.id },
          data: { gestionadoPorOperador: true },
        });
      }
      // La versión del partido invalida las apuestas en vivo en espera (research.md §6).
      await tx.partido.update({
        where: { id: mercado.partidoId },
        data: { version: { increment: 1 } },
      });
      await this.auditar(tx, contexto, 'cuota.cambiada', seleccionId, {
        mercadoId: mercado.id,
        partidoId: mercado.partidoId,
        codigo: seleccion.codigo,
        cuotaAnterior: aTexto(seleccion.cuota),
        cuotaNueva: aTexto(cuota),
      });
      // T035 (HU5): emitir `mercado.actualizado` por WebSocket después del commit.
      return this.partidos.obtener(mercado.partidoId, tx);
    });
  }

  suspender(
    mercadoId: string,
    motivo: string,
    contexto: ContextoAccion,
  ): Promise<PartidoDetalleDto> {
    return this.cambiarEstado(mercadoId, 'SUSPENDIDO', motivo, contexto);
  }

  reabrir(mercadoId: string, motivo: string, contexto: ContextoAccion): Promise<PartidoDetalleDto> {
    return this.cambiarEstado(mercadoId, 'ABIERTO', motivo, contexto);
  }

  private async cambiarEstado(
    mercadoId: string,
    estado: 'ABIERTO' | 'SUSPENDIDO',
    motivo: string,
    contexto: ContextoAccion,
  ): Promise<PartidoDetalleDto> {
    return this.prisma.$transaction(async (tx) => {
      const encontrado = await tx.mercado.findUnique({ where: { id: mercadoId } });
      if (!encontrado) throw new NotFoundException('El mercado no existe');
      const partido = await bloquearPartido(tx, encontrado.partidoId);
      const mercado = await tx.mercado.findUniqueOrThrow({ where: { id: mercadoId } });

      if (mercado.estado === 'CERRADO') {
        throw new ErrorNegocio('MERCADO_CERRADO', 'El mercado está cerrado y no admite cambios');
      }
      if (estado === 'ABIERTO') await this.exigirQuePuedaAbrirse(tx, partido, mercado.admiteVivo);
      if (mercado.estado === estado) return this.partidos.obtener(partido.id, tx);

      await tx.mercado.update({ where: { id: mercadoId }, data: { estado } });
      await tx.partido.update({ where: { id: partido.id }, data: { version: { increment: 1 } } });
      const accion = estado === 'ABIERTO' ? 'mercado.reabierto' : 'mercado.suspendido';
      await this.auditar(tx, contexto, accion, mercadoId, { partidoId: partido.id, motivo });
      return this.partidos.obtener(partido.id, tx);
    });
  }

  /** Un mercado solo reabre si el partido admite apuestas en ese momento (FR-017). */
  private async exigirQuePuedaAbrirse(
    tx: ClienteTransaccional,
    partido: { estado: Parameters<typeof admiteApuestas>[0]; inicioEn: Date },
    admiteVivo: boolean,
  ): Promise<void> {
    const yaEmpezo = partido.inicioEn.getTime() <= (await ahoraServidor(tx)).getTime();
    const abrible =
      admiteApuestas(partido.estado) && (partido.estado === 'EN_VIVO' ? admiteVivo : !yaEmpezo);
    if (!abrible) {
      throw new ErrorNegocio(
        'MERCADO_CERRADO',
        'El partido no admite apuestas en este mercado ahora: no se puede reabrir',
      );
    }
  }

  private auditar(
    tx: ClienteTransaccional,
    contexto: ContextoAccion,
    accion: string,
    entidadId: string,
    datos: Record<string, unknown>,
  ): Promise<void> {
    const entidad = accion.startsWith('cuota') ? 'seleccion' : 'mercado';
    return this.auditoria.registrar(
      {
        actorId: contexto.actorId,
        accion,
        entidad,
        entidadId,
        datos: { ...datos, origen: contexto.origen },
        ...(contexto.ip ? { ip: contexto.ip } : {}),
        ...(contexto.dispositivo ? { dispositivo: contexto.dispositivo } : {}),
      },
      tx,
    );
  }
}
