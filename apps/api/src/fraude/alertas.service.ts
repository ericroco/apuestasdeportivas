import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import type { Pagina } from '../comun/consultas.js';
import type { ContextoAccion } from '../comun/contexto-accion.js';
import { requerir } from '../comun/dependencias.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FiltrosAlertas, ResolverAlerta } from './alertas.esquemas.js';
import { aVistaAlerta, type VistaAlerta } from './alertas.vista.js';

const alertaNoEncontrada = () =>
  new ErrorNegocio('NO_ENCONTRADO', HttpStatus.NOT_FOUND, 'La alerta no existe.');

/** Revisión humana de las alertas de fraude (HU4): listar, ver y resolver. La creación está en `RegistroAlertasService`. */
@Injectable()
export class AlertasService {
  private readonly reloj: Reloj;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(AUDITORIA_PORT) private readonly auditoria?: AuditoriaPort,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  async listar(filtros: FiltrosAlertas): Promise<Pagina<VistaAlerta>> {
    const where = this.condiciones(filtros);
    const [alertas, total] = await this.prisma.$transaction([
      this.prisma.alertaFraude.findMany({
        where,
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        skip: (filtros.pagina - 1) * filtros.tamano,
        take: filtros.tamano,
      }),
      this.prisma.alertaFraude.count({ where }),
    ]);
    return {
      datos: alertas.map(aVistaAlerta),
      total,
      pagina: filtros.pagina,
      tamano: filtros.tamano,
    };
  }

  async obtener(id: string): Promise<VistaAlerta> {
    const alerta = await this.prisma.alertaFraude.findUnique({ where: { id } });
    if (!alerta) throw alertaNoEncontrada();
    return aVistaAlerta(alerta);
  }

  /**
   * `ABIERTA → CONFIRMADA | DESCARTADA` con un UPDATE condicional: de dos resoluciones simultáneas solo una cambia
   * la fila y la otra recibe 409. La auditoría se escribe en la misma transacción (falla cerrada si no hay puerto).
   */
  async resolver(
    id: string,
    datos: ResolverAlerta,
    contexto: ContextoAccion,
  ): Promise<VistaAlerta> {
    const auditoria = requerir(this.auditoria, 'auditoría');
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.alertaFraude.updateMany({
        where: { id, estado: 'ABIERTA' },
        data: {
          estado: datos.estado,
          nota: datos.nota,
          resueltaPor: contexto.actorId,
          resueltaEn: this.reloj.ahora(),
        },
      });
      if (count === 0) throw await this.motivoDeNoResolver(tx, id);
      const resuelta = await tx.alertaFraude.findUniqueOrThrow({ where: { id } });
      await auditoria.registrar(
        {
          actorId: contexto.actorId,
          accion: 'alerta.resuelta',
          entidad: 'alerta_fraude',
          entidadId: id,
          ip: contexto.ip,
          dispositivo: contexto.dispositivo,
          datos: { estado: datos.estado, regla: resuelta.regla, usuarioId: resuelta.usuarioId },
        },
        tx,
      );
      return aVistaAlerta(resuelta);
    });
  }

  private async motivoDeNoResolver(
    tx: Pick<PrismaService, 'alertaFraude'>,
    id: string,
  ): Promise<ErrorNegocio> {
    const existente = await tx.alertaFraude.findUnique({ where: { id }, select: { id: true } });
    if (!existente) return alertaNoEncontrada();
    return new ErrorNegocio('ALERTA_RESUELTA', HttpStatus.CONFLICT, 'La alerta ya fue resuelta.');
  }

  private condiciones(filtros: FiltrosAlertas): Prisma.AlertaFraudeWhereInput {
    const { desde, hasta } = filtros;
    return {
      ...(filtros.estado && { estado: filtros.estado }),
      ...(filtros.severidad && { severidad: filtros.severidad }),
      ...(filtros.regla && { regla: filtros.regla }),
      ...(filtros.usuarioId && { usuarioId: filtros.usuarioId }),
      ...((desde || hasta) && {
        creadaEn: { ...(desde && { gte: desde }), ...(hasta && { lte: hasta }) },
      }),
    };
  }
}
