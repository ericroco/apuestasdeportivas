import { aTexto, aTextoONulo, type Decimal } from '../comun/montos.js';
import type { Bono, EstadoBono } from '../generated/prisma/client.js';
import type { Motivo } from './motivos.js';

/** Un bono en "Mis bonos" (contracts/api-rest.md, `GET /bonos/mios`). Montos como texto decimal. */
export interface VistaBono {
  readonly id: string;
  readonly monto: string;
  readonly requisito: string;
  readonly avance: string;
  /** Entero de 0 a 100. */
  readonly porcentajeAvance: number;
  readonly estado: EstadoBono;
  readonly otorgadoEn: string;
  readonly venceEn: string;
  readonly cumplidoEn: string | null;
  readonly montoConvertido: string | null;
  readonly codigoCupon: string;
}

export interface VistaCanjeRechazado {
  readonly codigo: string;
  readonly motivo: Motivo;
  readonly creadoEn: string;
}

export interface MisBonos {
  readonly activo: VistaBono | null;
  readonly historial: readonly VistaBono[];
  readonly canjesRechazados: readonly VistaCanjeRechazado[];
  /** Cuota total mínima para que una apuesta cuente (CUPON_ROLLOVER_CUOTA_MINIMA). */
  readonly cuotaMinima: string;
}

/** Avance del rollover en porcentaje entero, truncado y con tope en 100. */
export function porcentajeDeAvance(avance: Decimal, requisito: Decimal): number {
  if (avance.gte(requisito)) return 100;
  return avance.times(100).dividedBy(requisito).floor().toNumber();
}

export function aVistaBono(
  bono: Bono & { readonly cupon: { readonly codigo: string } },
): VistaBono {
  return {
    id: bono.id,
    monto: aTexto(bono.monto),
    requisito: aTexto(bono.requisito),
    avance: aTexto(bono.avance),
    porcentajeAvance: porcentajeDeAvance(bono.avance, bono.requisito),
    estado: bono.estado,
    otorgadoEn: bono.otorgadoEn.toISOString(),
    venceEn: bono.venceEn.toISOString(),
    cumplidoEn: bono.cumplidoEn?.toISOString() ?? null,
    montoConvertido: aTextoONulo(bono.montoConvertido),
    codigoCupon: bono.cupon.codigo,
  };
}
