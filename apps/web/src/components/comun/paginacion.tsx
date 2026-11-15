import Link from 'next/link';
import { formatearEntero } from '@/lib/formato';
import { ENLACE } from './estilos';

interface PaginacionProps {
  readonly pagina: number;
  readonly tamano: number;
  readonly total: number;
  /** Arma la URL de una página conservando los filtros. */
  readonly hrefDePagina: (pagina: number) => string;
  /** Qué se cuenta, en plural, p. ej. "cupones". */
  readonly elementos: string;
}

export function Paginacion({ pagina, tamano, total, hrefDePagina, elementos }: PaginacionProps) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  return (
    <nav
      aria-label="Páginas"
      className="text-tinta-suave mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p>
        {formatearEntero(total)} {elementos}. Página {pagina} de {paginas}.
      </p>
      <div className="flex gap-4">
        {pagina > 1 && (
          <Link href={hrefDePagina(pagina - 1)} className={ENLACE}>
            Página anterior
          </Link>
        )}
        {pagina < paginas && (
          <Link href={hrefDePagina(pagina + 1)} className={ENLACE}>
            Página siguiente
          </Link>
        )}
      </div>
    </nav>
  );
}
