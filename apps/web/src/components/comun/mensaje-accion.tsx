import type { EstadoAccion } from '@/lib/acciones';

interface MensajeAccionProps {
  readonly estado: Pick<EstadoAccion, 'resultado' | 'mensaje' | 'intento'>;
  readonly className?: string;
}

/**
 * Región viva que anuncia el resultado de una acción. Está siempre en el DOM (vacía al inicio) para que
 * los lectores de pantalla lean el mensaje cuando aparece.
 */
export function MensajeAccion({ estado, className = '' }: MensajeAccionProps) {
  const tono = estado.resultado === 'error' ? 'text-falla' : 'text-ok';
  return (
    <p role="status" aria-live="polite" className={`text-sm font-semibold ${tono} ${className}`}>
      {estado.mensaje && <span key={estado.intento}>{estado.mensaje}</span>}
    </p>
  );
}
