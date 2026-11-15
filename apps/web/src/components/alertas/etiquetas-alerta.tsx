import type { EstadoAlerta, SeveridadAlerta } from '@apuestas/shared';
import { Etiqueta, type TonoEtiqueta } from '@/components/comun/etiqueta';
import { NOMBRE_ESTADO_ALERTA, NOMBRE_SEVERIDAD } from '@/lib/alertas/textos';

const TONO_SEVERIDAD: Readonly<Record<SeveridadAlerta, TonoEtiqueta>> = {
  ALTA: 'falla',
  MEDIA: 'aviso',
};

const TONO_ESTADO: Readonly<Record<EstadoAlerta, TonoEtiqueta>> = {
  ABIERTA: 'tinta',
  CONFIRMADA: 'falla',
  DESCARTADA: 'neutro',
};

export function EtiquetaSeveridad({ severidad }: { readonly severidad: SeveridadAlerta }) {
  return (
    <Etiqueta tono={TONO_SEVERIDAD[severidad]}>
      <span className="sr-only">Severidad </span>
      {NOMBRE_SEVERIDAD[severidad]}
    </Etiqueta>
  );
}

export function EtiquetaEstadoAlerta({ estado }: { readonly estado: EstadoAlerta }) {
  return <Etiqueta tono={TONO_ESTADO[estado]}>{NOMBRE_ESTADO_ALERTA[estado]}</Etiqueta>;
}
