import { Inject, Injectable, Optional } from '@nestjs/common';
import { aTexto } from '../comun/montos.js';
import { RELOJ, relojDelSistema, type Reloj } from '../comun/reloj.js';
import type { Cupon, TipoCupon } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CanjeService } from './canje.service.js';
import { FORMATO_CODIGO, normalizarCodigo } from './cupones.esquemas.js';
import { motivo, type CodigoMotivo, type Motivo } from './motivos.js';
import { motivoDeDisponibilidad } from './reglas-canje.js';

/** Respuesta de `GET /api/cupones/vista-previa/:codigo` (contracts/api-rest.md). */
export interface VistaPreviaCupon {
  readonly codigo: string;
  readonly tipo: TipoCupon | null;
  readonly descripcion: string | null;
  readonly terminaEn: string | null;
  readonly puedeUsar: boolean;
  readonly motivo: Motivo | null;
}

/** Texto del valor y las condiciones del cupón para el apostador. */
export function describirCupon(cupon: Cupon): string {
  const porcentaje = cupon.porcentaje?.toString() ?? '0';
  const monto = (valor: Cupon['montoFijo']) => (valor ? aTexto(valor) : '0.00');
  switch (cupon.tipo) {
    case 'BONO_DEPOSITO':
      return `Bono del ${porcentaje} % de tu depósito, hasta ${monto(cupon.topeBono)}. Depósito mínimo ${monto(cupon.depositoMinimo)}.`;
    case 'APUESTA_GRATIS':
      return `Apuesta gratis de hasta ${monto(cupon.montoFijo)}.`;
    case 'AUMENTO_CUOTA':
      return `Aumento del ${porcentaje} % sobre la cuota total, en apuestas de hasta ${monto(cupon.apuestaMaxima)}.`;
  }
}

/**
 * Vista previa de un código sin consumirlo (FR-009): evalúa las reglas que no dependen de la operación. No
 * bloquea el cupón ni registra alertas; la decisión final se toma al canjear, con el cupón bloqueado.
 */
@Injectable()
export class VistaPreviaService {
  private readonly reloj: Reloj;

  constructor(
    private readonly prisma: PrismaService,
    private readonly canje: CanjeService,
    @Optional() @Inject(RELOJ) reloj?: Reloj,
  ) {
    this.reloj = reloj ?? relojDelSistema;
  }

  async previsualizar(usuarioId: string, codigoRecibido: string): Promise<VistaPreviaCupon> {
    const codigo = normalizarCodigo(codigoRecibido);
    const cupon = FORMATO_CODIGO.test(codigo)
      ? await this.prisma.cupon.findUnique({ where: { codigo } })
      : null;
    // Un código inexistente no revela nada más (enumeración de códigos).
    if (!cupon) return inexistente(codigo);
    const codigoMotivo =
      motivoDeDisponibilidad(cupon, this.reloj.ahora()) ??
      (await this.canje.motivoDelUsuario(
        this.prisma,
        cupon,
        { usuarioId, origen: cupon.tipo === 'BONO_DEPOSITO' ? 'DEPOSITO' : 'APUESTA' },
        { alertar: false },
      ));
    return {
      codigo: cupon.codigo,
      tipo: cupon.tipo,
      descripcion: describirCupon(cupon),
      terminaEn: cupon.terminaEn.toISOString(),
      puedeUsar: codigoMotivo === null,
      motivo: codigoMotivo ? motivo(codigoMotivo as CodigoMotivo) : null,
    };
  }
}

function inexistente(codigo: string): VistaPreviaCupon {
  return {
    codigo,
    tipo: null,
    descripcion: null,
    terminaEn: null,
    puedeUsar: false,
    motivo: motivo('CUPON_INEXISTENTE'),
  };
}
