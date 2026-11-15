import type { ReactNode } from 'react';

export type TonoEtiqueta = 'ok' | 'falla' | 'aviso' | 'neutro' | 'tinta';

const ESTILO: Readonly<Record<TonoEtiqueta, string>> = {
  ok: 'border-ok text-ok',
  falla: 'border-falla text-falla',
  aviso: 'border-aviso text-aviso',
  neutro: 'border-tinta-suave text-tinta-suave',
  tinta: 'border-tinta bg-tinta text-papel',
};

interface EtiquetaProps {
  readonly tono: TonoEtiqueta;
  readonly children: ReactNode;
}

/** Estado en texto con borde de color: el color acompaña a la palabra, nunca la reemplaza. */
export function Etiqueta({ tono, children }: EtiquetaProps) {
  return (
    <span
      className={`font-display inline-block rounded-sm border-2 px-2 py-0.5 text-base leading-tight font-semibold whitespace-nowrap ${ESTILO[tono]}`}
    >
      {children}
    </span>
  );
}
