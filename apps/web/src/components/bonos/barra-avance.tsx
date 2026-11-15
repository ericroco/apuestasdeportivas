import { useId } from 'react';
import { formatearMonto } from '@/lib/formato';

interface BarraAvanceProps {
  /** Lo calcula la API (0–100). */
  readonly porcentaje: number;
  readonly avance: string;
  readonly requisito: string;
}

/**
 * Avance del rollover. El ancho sale del `porcentajeAvance` que entrega la API; la web no divide montos.
 * La pista es un tono claro de la misma tinta que el relleno, para leer el total de un vistazo.
 */
export function BarraAvance({ porcentaje, avance, requisito }: BarraAvanceProps) {
  const id = useId();
  const valor = Math.round(Math.min(100, Math.max(0, porcentaje)));
  return (
    <div>
      <p id={id} className="text-tinta-suave text-sm font-semibold">
        Avance del rollover
      </p>
      <div
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valor}
        aria-valuetext={`${formatearMonto(avance)} de ${formatearMonto(requisito)} apostados (${valor} %)`}
        className="bg-pista mt-1 h-4 overflow-hidden rounded-full"
      >
        <div className="bg-tinta h-full rounded-full" style={{ width: `${valor}%` }} />
      </div>
      <p className="mt-1 flex justify-between text-sm tabular-nums">
        <span>{valor} %</span>
        <span className="text-tinta-suave">100 %</span>
      </p>
    </div>
  );
}
