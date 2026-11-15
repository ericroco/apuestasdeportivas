import { Inject, Injectable, Optional } from '@nestjs/common';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EntradaActividad } from './actividad.mapeo.js';

/** Cliente de base de datos: el `PrismaService` o el `tx` de quien llama. */
export type ClienteActividad = Pick<ClienteTransaccional, 'actividadUsuario'>;

/** Otras cuentas que comparten dispositivo o método de pago con un usuario (FR-006, FR-018). */
export interface CuentasRelacionadas {
  readonly dispositivos: readonly string[];
  readonly porDispositivo: readonly string[];
  readonly porMetodoPago: readonly string[];
}

/**
 * Actividad observada desde los eventos de dominio (FR-017), append-only. La unicidad `(tipo, referencia_id)` hace
 * idempotente el registro: un evento repetido no crea otra fila.
 */
@Injectable()
export class ActividadService {
  private readonly reloj: Reloj;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  /** Inserta con `on conflict do nothing`; `true` si la fila es nueva, `false` si el evento ya se había visto. */
  async registrar(
    entrada: EntradaActividad,
    cliente: ClienteActividad = this.prisma,
  ): Promise<boolean> {
    const { count } = await cliente.actividadUsuario.createMany({
      data: [{ ...entrada, ocurridoEn: this.reloj.ahora() }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async cuentasRelacionadas(
    usuarioId: string,
    opciones: { readonly metodoPagoHuella?: string | null },
    cliente: ClienteActividad = this.prisma,
  ): Promise<CuentasRelacionadas> {
    const propios = await cliente.actividadUsuario.findMany({
      where: { usuarioId, dispositivo: { not: null } },
      select: { dispositivo: true },
      distinct: ['dispositivo'],
    });
    const dispositivos = propios.flatMap(({ dispositivo }) => (dispositivo ? [dispositivo] : []));
    const porDispositivo = dispositivos.length
      ? await this.otrosUsuarios(cliente, { dispositivo: { in: dispositivos } }, usuarioId)
      : [];
    const porMetodoPago = opciones.metodoPagoHuella
      ? await this.otrosUsuarios(
          cliente,
          { tipo: 'DEPOSITO', metodoPagoHuella: opciones.metodoPagoHuella },
          usuarioId,
        )
      : [];
    return { dispositivos, porDispositivo, porMetodoPago };
  }

  private async otrosUsuarios(
    cliente: ClienteActividad,
    filtro: { dispositivo?: { in: string[] }; tipo?: 'DEPOSITO'; metodoPagoHuella?: string },
    usuarioId: string,
  ): Promise<string[]> {
    const filas = await cliente.actividadUsuario.findMany({
      where: { ...filtro, usuarioId: { not: usuarioId } },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
    });
    return filas.map((fila) => fila.usuarioId);
  }
}
