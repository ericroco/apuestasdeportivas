import type { VistaCupon } from '@apuestas/shared';
import { Etiqueta, type TonoEtiqueta } from '@/components/comun/etiqueta';
import {
  NOMBRE_ESTADO_VISIBLE,
  estadoVisible,
  type EstadoVisibleCupon,
} from '@/lib/cupones/textos';

const TONO_ESTADO: Readonly<Record<EstadoVisibleCupon, TonoEtiqueta>> = {
  activo: 'ok',
  pausado: 'neutro',
  'fuera-de-vigencia': 'aviso',
  agotado: 'tinta',
};

interface EstadoCuponProps {
  readonly cupon: Pick<VistaCupon, 'estado' | 'vigente' | 'canjes' | 'cupoTotal'>;
}

/** Si el cupón acepta canjes hoy: activo, pausado, fuera de vigencia o agotado. */
export function EstadoCupon({ cupon }: EstadoCuponProps) {
  const estado = estadoVisible(cupon);
  return <Etiqueta tono={TONO_ESTADO[estado]}>{NOMBRE_ESTADO_VISIBLE[estado]}</Etiqueta>;
}
