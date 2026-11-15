import { z } from 'zod';

/** Un filtro de query string vacío (`?estado=`) cuenta como ausente. */
export function filtroOpcional<T extends z.ZodType>(esquema: T) {
  return z.preprocess((valor) => (valor === '' ? undefined : valor), esquema.optional());
}

/** Paginación de las listas: `pagina` desde 1 y `tamano` de 1 a 100 (20 por defecto). */
export const camposDePaginacion = {
  pagina: z.coerce.number().int().min(1).max(100_000).default(1),
  tamano: z.coerce.number().int().min(1).max(100).default(20),
};

export interface Pagina<T> {
  readonly datos: readonly T[];
  readonly total: number;
  readonly pagina: number;
  readonly tamano: number;
}
