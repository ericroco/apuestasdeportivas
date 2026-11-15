import { Inject, Injectable, Optional } from '@nestjs/common';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import type { CanjeCupon } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { vencerBonos } from './bono.consultas.js';
import { aVistaBono, type MisBonos, type VistaCanjeRechazado } from './bono.vista.js';
import { motivoGuardado } from './motivos.js';

/** Bonos y canjes rechazados que se muestran; los más antiguos no se listan. */
const MAXIMO_HISTORIAL = 20;

function aVistaRechazo(canje: CanjeCupon): VistaCanjeRechazado[] {
  const motivo = motivoGuardado(canje.motivo);
  return motivo ? [{ codigo: canje.codigo, motivo, creadoEn: canje.creadoEn.toISOString() }] : [];
}

/** "Mis bonos" del apostador (FR-015): bono activo con su avance, historial y canjes rechazados. */
@Injectable()
export class MisBonosService {
  private readonly reloj: Reloj;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  async obtener(usuarioId: string): Promise<MisBonos> {
    // Vencimiento perezoso al consultar (FR-014).
    await vencerBonos(this.prisma, usuarioId, this.reloj.ahora());
    const [bonos, rechazados] = await Promise.all([
      this.prisma.bono.findMany({
        where: { usuarioId },
        include: { cupon: { select: { codigo: true } } },
        orderBy: [{ otorgadoEn: 'desc' }, { id: 'desc' }],
        take: MAXIMO_HISTORIAL + 1,
      }),
      this.prisma.canjeCupon.findMany({
        where: { usuarioId, estado: 'RECHAZADO' },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        take: MAXIMO_HISTORIAL,
      }),
    ]);
    const vistas = bonos.map(aVistaBono);
    return {
      activo: vistas.find((bono) => bono.estado === 'ACTIVO') ?? null,
      historial: vistas.filter((bono) => bono.estado !== 'ACTIVO').slice(0, MAXIMO_HISTORIAL),
      canjesRechazados: rechazados.flatMap(aVistaRechazo),
      cuotaMinima: this.entorno.CUPON_ROLLOVER_CUOTA_MINIMA,
    };
  }
}
