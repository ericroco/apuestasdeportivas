import type { ReactNode } from 'react';
import { AYUDA_CAMPO, ERROR_CAMPO, ETIQUETA_CAMPO } from './estilos';

interface CampoProps {
  readonly id: string;
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly error?: string;
  readonly className?: string;
  /** Recibe los atributos de accesibilidad que debe llevar el control. */
  readonly children: (atributos: AtributosControl) => ReactNode;
}

export interface AtributosControl {
  readonly id: string;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby'?: string;
}

/** Etiqueta, ayuda y error de un control, enlazados con `aria-describedby`. */
export function Campo({ id, etiqueta, ayuda, error, className = '', children }: CampoProps) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  const descripcion = [idAyuda, idError].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={ETIQUETA_CAMPO}>
        {etiqueta}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': descripcion })}
      {ayuda && (
        <p id={idAyuda} className={AYUDA_CAMPO}>
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className={ERROR_CAMPO}>
          {error}
        </p>
      )}
    </div>
  );
}
