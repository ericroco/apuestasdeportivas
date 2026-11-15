/**
 * Clases compartidas de controles. Botones de al menos 44 px de alto (objetivo táctil) con estados de
 * hover, foco (anillo global de globals.css) y pulsado; los textos nombran la acción.
 */

const BASE_BOTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold ' +
  'transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60';

export const BOTON_PRIMARIO = `${BASE_BOTON} bg-tinta text-papel hover:bg-mostrador/85`;

/** Sobre la franja amarilla el hover no puede ser amarillo. */
export const BOTON_EN_FRANJA = `${BASE_BOTON} bg-tinta text-papel hover:bg-papel hover:text-tinta`;

export const BOTON_SECUNDARIO = `${BASE_BOTON} border-2 border-tinta text-tinta hover:bg-papel-hondo`;

export const BOTON_PELIGRO = `${BASE_BOTON} bg-falla text-papel hover:bg-tinta`;

export const ENLACE = 'font-semibold underline underline-offset-2 hover:text-tinta-suave';

export const CAMPO =
  'border-tinta-suave bg-papel min-h-11 w-full rounded-md border-2 px-3 py-2 text-base ' +
  'aria-invalid:border-falla';

export const ETIQUETA_CAMPO = 'block font-semibold';

export const AYUDA_CAMPO = 'text-tinta-suave mt-1 text-sm';

export const ERROR_CAMPO = 'text-falla mt-1 text-sm font-semibold';
