import { Injectable } from '@nestjs/common';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { ReglaFraude, SeveridadAlerta } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NuevaAlerta {
  readonly regla: ReglaFraude;
  readonly severidad: SeveridadAlerta;
  /** Usuario evaluado. */
  readonly usuarioId: string;
  /** Cuentas relacionadas, dispositivo, IP, montos, ventana… nunca datos de pago en claro. */
  readonly evidencia: Readonly<Record<string, unknown>>;
  /** Clave de deduplicación de data-model.md, p. ej. `cupon:<usuarioId>:<cuponId>`. */
  readonly claveDeduplicacion: string;
}

/**
 * Alta mínima de alertas de fraude (FR-022), compartida por promociones (cuenta múltiple al canjear) y por las
 * reglas de fraude. Usa siempre el `PrismaService` y NO el `tx` de quien llama: si la operación que la dispara se
 * revierte (p. ej. la apuesta del Spec 3), la alerta debe quedar.
 */
@Injectable()
export class RegistroAlertasService {
  constructor(private readonly prisma: PrismaService) {}

  /** `true` si la alerta es nueva; `false` si ya existía una con la misma clave de deduplicación. */
  async registrar(alerta: NuevaAlerta): Promise<boolean> {
    const insertadas = await this.prisma.$executeRaw`
      INSERT INTO alerta_fraude (regla, severidad, usuario_id, evidencia, clave_deduplicacion)
      VALUES (
        ${alerta.regla}::regla_fraude,
        ${alerta.severidad}::severidad_alerta,
        ${alerta.usuarioId},
        ${JSON.stringify(alerta.evidencia)}::jsonb,
        ${alerta.claveDeduplicacion}
      )
      ON CONFLICT (clave_deduplicacion) DO NOTHING`;
    return insertadas > 0;
  }

  /**
   * `true` si el usuario tiene una alerta ALTA abierta o confirmada: no puede canjear cupones que otorgan bono
   * (FR-007) y sus retiros van a revisión (FR-024).
   */
  async tieneAlertaAltaVigente(
    usuarioId: string,
    cliente: Pick<ClienteTransaccional, 'alertaFraude'> = this.prisma,
  ): Promise<boolean> {
    const alerta = await cliente.alertaFraude.findFirst({
      where: { usuarioId, severidad: 'ALTA', estado: { in: ['ABIERTA', 'CONFIRMADA'] } },
      select: { id: true },
    });
    return alerta !== null;
  }
}
