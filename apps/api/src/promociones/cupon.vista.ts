import { aTextoONulo } from '../comun/montos.js';
import type { Cupon, EstadoCupon, TipoCupon } from '../generated/prisma/client.js';
import { motivoDeDisponibilidad } from './reglas-canje.js';

/** Vista de un cupón en todas las rutas de gestión (contracts/api-rest.md). Montos como texto decimal. */
export interface VistaCupon {
  readonly id: string;
  readonly codigo: string;
  readonly tipo: TipoCupon;
  readonly porcentaje: string | null;
  readonly montoFijo: string | null;
  readonly topeBono: string | null;
  readonly depositoMinimo: string | null;
  readonly apuestaMaxima: string | null;
  readonly iniciaEn: string;
  readonly terminaEn: string;
  readonly cupoTotal: number;
  readonly limitePorUsuario: number;
  readonly canjes: number;
  readonly estado: EstadoCupon;
  /** `true` si hoy se puede canjear: activo, dentro de su vigencia (reloj del servidor) y con cupo. */
  readonly vigente: boolean;
  readonly creadoEn: string;
}

export interface ResumenCanjes {
  readonly aceptados: number;
  readonly rechazados: number;
  readonly bonoOtorgado: string;
}

export interface DetalleCupon extends VistaCupon {
  readonly resumenCanjes: ResumenCanjes;
}

export function aVistaCupon(cupon: Cupon, ahora: Date): VistaCupon {
  return {
    id: cupon.id,
    codigo: cupon.codigo,
    tipo: cupon.tipo,
    porcentaje: aTextoONulo(cupon.porcentaje),
    montoFijo: aTextoONulo(cupon.montoFijo),
    topeBono: aTextoONulo(cupon.topeBono),
    depositoMinimo: aTextoONulo(cupon.depositoMinimo),
    apuestaMaxima: aTextoONulo(cupon.apuestaMaxima),
    iniciaEn: cupon.iniciaEn.toISOString(),
    terminaEn: cupon.terminaEn.toISOString(),
    cupoTotal: cupon.cupoTotal,
    limitePorUsuario: cupon.limitePorUsuario,
    canjes: cupon.canjes,
    estado: cupon.estado,
    vigente: motivoDeDisponibilidad(cupon, ahora) === null,
    creadoEn: cupon.creadoEn.toISOString(),
  };
}
