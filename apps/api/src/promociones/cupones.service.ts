import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import type { Pagina } from '../comun/consultas.js';
import type { ContextoAccion } from '../comun/contexto-accion.js';
import { requerir } from '../comun/dependencias.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import { CERO, aTexto } from '../comun/montos.js';
import { esViolacionDeUnicidad } from '../comun/prisma-errores.js';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { Cupon } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { bloquearCuponPorId } from './cupon.bloqueo.js';
import { aVistaCupon, type DetalleCupon, type VistaCupon } from './cupon.vista.js';
import {
  normalizarCodigo,
  type ActualizarCupon,
  type CrearCupon,
  type FiltrosCupones,
} from './cupones.esquemas.js';
import { planificarCambios } from './cupones.reglas.js';

const cuponNoEncontrado = () =>
  new ErrorNegocio('NO_ENCONTRADO', HttpStatus.NOT_FOUND, 'El cupón no existe.');

/** Gestión de cupones por el operador (HU1). Todo cambio se audita en la misma transacción. */
@Injectable()
export class CuponesService {
  private readonly reloj: Reloj;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(AUDITORIA_PORT) private readonly auditoria?: AuditoriaPort,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  async crear(datos: CrearCupon, contexto: ContextoAccion): Promise<VistaCupon> {
    const auditoria = requerir(this.auditoria, 'auditoría');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cupon = await tx.cupon.create({ data: { ...datos, creadoPor: contexto.actorId } });
        const vista = aVistaCupon(cupon, this.reloj.ahora());
        await auditoria.registrar(
          { ...this.evento('cupon.creado', cupon, contexto), datos: { ...vista } },
          tx,
        );
        return vista;
      });
    } catch (error) {
      if (!esViolacionDeUnicidad(error)) throw error;
      throw new ErrorNegocio(
        'CODIGO_DUPLICADO',
        HttpStatus.CONFLICT,
        'Ya existe un cupón con ese código (los códigos no distinguen mayúsculas).',
      );
    }
  }

  async listar(filtros: FiltrosCupones): Promise<Pagina<VistaCupon>> {
    const where = {
      ...(filtros.estado && { estado: filtros.estado }),
      ...(filtros.tipo && { tipo: filtros.tipo }),
      ...(filtros.busqueda && { codigo: { startsWith: normalizarCodigo(filtros.busqueda) } }),
    };
    const [cupones, total] = await this.prisma.$transaction([
      this.prisma.cupon.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: (filtros.pagina - 1) * filtros.tamano,
        take: filtros.tamano,
      }),
      this.prisma.cupon.count({ where }),
    ]);
    const ahora = this.reloj.ahora();
    return {
      datos: cupones.map((cupon) => aVistaCupon(cupon, ahora)),
      total,
      pagina: filtros.pagina,
      tamano: filtros.tamano,
    };
  }

  async obtener(id: string): Promise<DetalleCupon> {
    const cupon = await this.prisma.cupon.findUnique({ where: { id } });
    if (!cupon) throw cuponNoEncontrado();
    const [porEstado, bonos] = await Promise.all([
      this.prisma.canjeCupon.groupBy({
        by: ['estado'],
        where: { cuponId: id },
        _count: { _all: true },
      }),
      this.prisma.bono.aggregate({ where: { cuponId: id }, _sum: { monto: true } }),
    ]);
    const contar = (estado: string) =>
      porEstado.find((grupo) => grupo.estado === estado)?._count._all ?? 0;
    return {
      ...aVistaCupon(cupon, this.reloj.ahora()),
      resumenCanjes: {
        aceptados: contar('ACEPTADO'),
        rechazados: contar('RECHAZADO'),
        bonoOtorgado: aTexto(bonos._sum.monto ?? CERO),
      },
    };
  }

  /** Bloquea el cupón para que el número de canjes no cambie mientras se decide si el cambio es válido. */
  async actualizar(
    id: string,
    cambios: ActualizarCupon,
    contexto: ContextoAccion,
  ): Promise<VistaCupon> {
    const auditoria = requerir(this.auditoria, 'auditoría');
    return this.prisma.$transaction(async (tx) => {
      const actual = await bloquearCuponPorId(tx, id);
      if (!actual) throw cuponNoEncontrado();
      const plan = planificarCambios(actual, cambios);
      if (plan.acciones.length === 0) return aVistaCupon(actual, this.reloj.ahora());
      const actualizado = await tx.cupon.update({ where: { id }, data: plan.datos });
      await this.auditar(tx, auditoria, plan.acciones, actualizado, contexto, {
        antes: plan.antes,
        despues: plan.despues,
      });
      return aVistaCupon(actualizado, this.reloj.ahora());
    });
  }

  private async auditar(
    tx: ClienteTransaccional,
    auditoria: AuditoriaPort,
    acciones: readonly string[],
    cupon: Cupon,
    contexto: ContextoAccion,
    datos: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    for (const accion of acciones) {
      await auditoria.registrar({ ...this.evento(accion, cupon, contexto), datos }, tx);
    }
  }

  private evento(accion: string, cupon: Cupon, contexto: ContextoAccion) {
    return {
      actorId: contexto.actorId,
      accion,
      entidad: 'cupon',
      entidadId: cupon.id,
      ip: contexto.ip,
      dispositivo: contexto.dispositivo,
    };
  }
}
