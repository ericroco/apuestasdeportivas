import { Inject, Injectable, Optional } from '@nestjs/common';
import { aTexto, type Decimal } from '../comun/montos.js';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import { Prisma, type Bono } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { vencerBonos } from './bono.consultas.js';
import { BonosService, type DependenciasBono } from './bonos.service.js';
import { claveDeConversion } from './claves-idempotencia.js';

export type EstadoRollover = 'SIN_BONO' | 'EN_CURSO' | 'CUMPLIDO';

/**
 * Rollover (FR-012, FR-013). El avance se RECALCULA desde `actividad_usuario` en lugar de sumarse por evento: cada
 * apuesta tiene una sola fila de liquidación (unicidad `(tipo, referencia_id)`), así que eventos repetidos,
 * re-liquidaciones o el orden en que lleguen no cuentan dos veces. La conversión ocurre una sola vez: el bono se
 * bloquea (`FOR UPDATE`), pasa a CUMPLIDO y la billetera usa la clave `bono:<id>:conversion`.
 */
@Injectable()
export class RolloverService {
  private readonly reloj: Reloj;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bonos: BonosService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  async recalcular(usuarioId: string): Promise<EstadoRollover> {
    return this.prisma.$transaction(async (tx) => {
      const ahora = this.reloj.ahora();
      await vencerBonos(tx, usuarioId, ahora);
      const bono = await this.bloquearBonoActivo(tx, usuarioId);
      if (!bono) return 'SIN_BONO';
      const avance = Prisma.Decimal.max(bono.avance, await this.apostadoQueCuenta(tx, bono));
      if (avance.lt(bono.requisito)) {
        if (avance.gt(bono.avance)) {
          await tx.bono.update({ where: { id: bono.id }, data: { avance } });
        }
        return 'EN_CURSO';
      }
      await this.convertir(tx, bono, avance, ahora, this.bonos.dependencias());
      return 'CUMPLIDO';
    });
  }

  private async bloquearBonoActivo(
    tx: ClienteTransaccional,
    usuarioId: string,
  ): Promise<Bono | null> {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM bono WHERE usuario_id = ${usuarioId} AND estado = 'ACTIVO' FOR UPDATE`;
    const fila = filas[0];
    return fila ? tx.bono.findUnique({ where: { id: fila.id } }) : null;
  }

  /**
   * Monto de las apuestas que cuentan: liquidadas como GANADA o PERDIDA, con su aceptación registrada después de
   * otorgado el bono y cuota total ≥ CUPON_ROLLOVER_CUOTA_MINIMA. Sin aceptación vista o sin cuota no cuentan.
   */
  private async apostadoQueCuenta(tx: ClienteTransaccional, bono: Bono): Promise<Decimal> {
    const [fila] = await tx.$queryRaw<Array<{ total: string }>>`
      SELECT COALESCE(SUM(l.monto), 0)::text AS total
      FROM actividad_usuario l
      JOIN actividad_usuario a
        ON a.tipo = 'APUESTA_ACEPTADA' AND a.referencia_id = l.referencia_id AND a.usuario_id = l.usuario_id
      WHERE l.usuario_id = ${bono.usuarioId}
        AND l.tipo = 'APUESTA_LIQUIDADA'
        AND l.resultado IN ('GANADA', 'PERDIDA')
        AND a.ocurrido_en >= ${bono.otorgadoEn}
        AND l.ocurrido_en < ${bono.venceEn}
        AND a.cuota IS NOT NULL AND a.cuota >= ${this.entorno.CUPON_ROLLOVER_CUOTA_MINIMA}::numeric`;
    return new Prisma.Decimal(fila?.total ?? 0);
  }

  /** Convierte TODO el saldo de bono del usuario en real (puede ser cero) y marca el bono como cumplido. */
  private async convertir(
    tx: ClienteTransaccional,
    bono: Bono,
    avance: Decimal,
    ahora: Date,
    { billetera, auditoria }: DependenciasBono,
  ): Promise<void> {
    const { bono: saldoBono } = await billetera.obtenerSaldos(bono.usuarioId, tx);
    const montoConvertido = saldoBono.gt(0) ? saldoBono : new Prisma.Decimal(0);
    if (montoConvertido.gt(0)) {
      await billetera.convertirBonoEnReal(tx, {
        usuarioId: bono.usuarioId,
        monto: montoConvertido,
        claveIdempotencia: claveDeConversion(bono.id),
        referencia: bono.cuponId,
      });
    }
    await tx.bono.update({
      where: { id: bono.id },
      data: { estado: 'CUMPLIDO', avance, cumplidoEn: ahora, montoConvertido },
    });
    await auditoria.registrar(
      {
        actorId: null,
        accion: 'bono.convertido',
        entidad: 'bono',
        entidadId: bono.id,
        datos: {
          usuarioId: bono.usuarioId,
          cuponId: bono.cuponId,
          requisito: aTexto(bono.requisito),
          avance: aTexto(avance),
          montoConvertido: aTexto(montoConvertido),
        },
      },
      tx,
    );
  }
}
