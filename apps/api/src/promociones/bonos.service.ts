import { Inject, Injectable, Optional } from '@nestjs/common';
import { requerir } from '../comun/dependencias.js';
import { aTexto, type Decimal } from '../comun/montos.js';
import { esViolacionDeUnicidad } from '../comun/prisma-errores.js';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import {
  BILLETERA_PORT,
  type BilleteraPort,
  type ClienteTransaccional,
} from '../contracts/billetera.port.js';
import type { Bono, CanjeCupon, Cupon } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CanjeService } from './canje.service.js';
import { claveDeBono } from './claves-idempotencia.js';
import { CuponRechazadoError } from './motivos.js';
import { calcularRequisito, calcularVencimiento } from './reglas-canje.js';

/** Puertos del Spec 2 que mueven dinero y auditan; sin ellos ningún bono se otorga (research.md §7). */
export interface DependenciasBono {
  readonly billetera: BilleteraPort;
  readonly auditoria: AuditoriaPort;
}

export interface DatosOtorgamiento {
  readonly cupon: Cupon;
  readonly canje: CanjeCupon;
  readonly monto: Decimal;
  /** Usuario que provoca el bono (apuesta gratis) o `null` si lo otorga un proceso del sistema (depósito). */
  readonly actorId: string | null;
}

/** Bonos y su requisito de rollover (FR-011). Todo movimiento de dinero va por la billetera del Spec 2. */
@Injectable()
export class BonosService {
  private readonly reloj: Reloj;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly canje: CanjeService,
    @Inject(ENTORNO) protected readonly entorno: Entorno,
    @Optional() @Inject(BILLETERA_PORT) private readonly billetera?: BilleteraPort,
    @Optional() @Inject(AUDITORIA_PORT) private readonly auditoria?: AuditoriaPort,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  /** Lanza `DependenciaNoDisponibleError` (503) si falta la billetera o la auditoría. Llamar antes de escribir. */
  dependencias(): DependenciasBono {
    return {
      billetera: requerir(this.billetera, 'billetera'),
      auditoria: requerir(this.auditoria, 'auditoría'),
    };
  }

  /**
   * Crea el bono ACTIVO, acredita su monto como saldo de bono con la clave `cupon:<cuponId>:<usuarioId>:<n>:bono` y
   * audita `bono.otorgado`, todo en `tx`: si la operación que lo origina se revierte, el bono también.
   */
  async otorgar(
    tx: ClienteTransaccional,
    datos: DatosOtorgamiento,
    dependencias: DependenciasBono = this.dependencias(),
  ): Promise<Bono> {
    const { cupon, canje, monto } = datos;
    const bono = await this.crearBono(tx, datos);
    await dependencias.billetera.acreditarBono(tx, {
      usuarioId: canje.usuarioId,
      monto,
      claveIdempotencia: claveDeBono(cupon.id, canje.usuarioId, canje.numero),
      referencia: cupon.id,
    });
    await dependencias.auditoria.registrar(
      {
        actorId: datos.actorId,
        accion: 'bono.otorgado',
        entidad: 'bono',
        entidadId: bono.id,
        datos: {
          usuarioId: canje.usuarioId,
          cuponId: cupon.id,
          codigo: cupon.codigo,
          origen: canje.origen,
          monto: aTexto(monto),
          requisito: aTexto(bono.requisito),
          venceEn: bono.venceEn.toISOString(),
        },
      },
      tx,
    );
    return bono;
  }

  private async crearBono(tx: ClienteTransaccional, datos: DatosOtorgamiento): Promise<Bono> {
    const otorgadoEn = this.reloj.ahora();
    try {
      return await tx.bono.create({
        data: {
          usuarioId: datos.canje.usuarioId,
          cuponId: datos.cupon.id,
          canjeId: datos.canje.id,
          monto: datos.monto,
          requisito: calcularRequisito(datos.monto, this.entorno.CUPON_ROLLOVER_MULTIPLICADOR),
          otorgadoEn,
          venceEn: calcularVencimiento(otorgadoEn, this.entorno.BONO_VIGENCIA_DIAS),
        },
      });
    } catch (error) {
      // Índice único parcial: otro bono ACTIVO del usuario se confirmó primero (red de seguridad de FR-007).
      if (esViolacionDeUnicidad(error)) throw new CuponRechazadoError('BONO_ACTIVO');
      throw error;
    }
  }
}
