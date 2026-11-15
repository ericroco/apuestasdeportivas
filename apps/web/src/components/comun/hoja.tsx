import Link from 'next/link';
import type { ReactNode } from 'react';

export interface Miga {
  readonly texto: string;
  readonly href: string;
}

interface HojaProps {
  /** Quién usa la pantalla, p. ej. "Operador". */
  readonly seccion: string;
  readonly titulo: string;
  readonly descripcion?: string;
  /** Ruta desde la pantalla principal de la sección hasta la actual (sin incluirla). */
  readonly migas?: readonly Miga[];
  /** Acción principal de la pantalla, junto al título. */
  readonly accion?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Hoja de trabajo sobre el mostrador: la misma pieza de papel que el boleto de la página de estado, más
 * ancha para listas y tablas. La franja amarilla lleva la sección y el título.
 */
export function Hoja({ seccion, titulo, descripcion, migas = [], accion, children }: HojaProps) {
  return (
    <main className="px-3 py-6 sm:px-4 sm:py-12">
      <article
        aria-labelledby="titulo"
        className="bg-papel mx-auto max-w-5xl overflow-hidden rounded-lg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]"
      >
        <header className="bg-franja flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-5 pb-4 sm:px-8">
          <div className="min-w-0">
            <p className="font-display text-lg font-medium">{seccion}</p>
            {migas.length > 0 && (
              <nav aria-label="Ruta" className="text-sm">
                <ol className="flex flex-wrap gap-x-1">
                  {migas.map((miga) => (
                    <li key={miga.href} className="after:ml-1 after:content-['/']">
                      <Link href={miga.href} className="underline underline-offset-2">
                        {miga.texto}
                      </Link>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <h1
              id="titulo"
              className="font-display text-4xl leading-none font-bold break-words sm:text-5xl"
            >
              {titulo}
            </h1>
          </div>
          {accion}
        </header>
        {descripcion && (
          <p className="text-tinta-suave max-w-prose px-4 pt-4 text-sm sm:px-8">{descripcion}</p>
        )}
        <div className="px-4 pt-4 pb-8 sm:px-8">{children}</div>
      </article>
    </main>
  );
}
