import Link from 'next/link';
import { type ComponentProps, type ReactNode, useId } from 'react';

/**
 * Piezas comunes de las pantallas del Spec 2, con la dirección visual del Spec 1 (un boleto sobre el mostrador).
 * Mobile-first desde 360 px; los colores vienen de los tokens con contraste AA de globals.css.
 */

export function Tarjeta({
  antetitulo,
  titulo,
  children,
  ancho = 'max-w-md',
}: {
  antetitulo?: string;
  titulo: string;
  children: ReactNode;
  ancho?: string;
}) {
  return (
    <main className="px-4 py-8 sm:py-14">
      <article
        aria-labelledby="titulo-tarjeta"
        className={`bg-papel mx-auto ${ancho} overflow-hidden rounded-lg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]`}
      >
        <header className="bg-franja px-6 pt-5 pb-4">
          <p className="font-display text-base font-medium">
            {antetitulo ?? 'Apuestas deportivas'}
          </p>
          <h1 id="titulo-tarjeta" className="font-display text-4xl leading-none font-bold">
            {titulo}
          </h1>
        </header>
        <div className="px-6 pt-5 pb-7">{children}</div>
      </article>
    </main>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  ...props
}: { etiqueta: string; ayuda?: string } & ComponentProps<'input'>) {
  const id = useId();
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block font-semibold">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-describedby={idAyuda}
        className="border-tinta-suave text-tinta w-full rounded-md border bg-white px-3 py-2 text-base"
        {...props}
      />
      {ayuda && (
        <p id={idAyuda} className="text-tinta-suave mt-1 text-sm">
          {ayuda}
        </p>
      )}
    </div>
  );
}

export function Boton({
  cargando = false,
  variante = 'primario',
  children,
  ...props
}: {
  cargando?: boolean;
  variante?: 'primario' | 'secundario' | 'peligro';
} & ComponentProps<'button'>) {
  const estilos = {
    primario: 'bg-tinta text-papel hover:bg-franja hover:text-tinta',
    secundario: 'border-tinta text-tinta border-2 bg-transparent hover:bg-franja',
    peligro: 'bg-falla text-papel hover:bg-tinta',
  }[variante];
  return (
    <button
      type="submit"
      aria-busy={cargando}
      disabled={cargando || props.disabled}
      className={`${estilos} w-full rounded-md px-4 py-2.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto`}
      {...props}
    >
      {cargando ? 'Un momento…' : children}
    </button>
  );
}

export function Aviso({
  tipo,
  children,
}: {
  tipo: 'error' | 'exito' | 'info';
  children: ReactNode;
}) {
  const estilos = {
    error: 'border-falla text-falla',
    exito: 'border-ok text-ok',
    info: 'border-tinta-suave text-tinta',
  }[tipo];
  return (
    <p
      role={tipo === 'error' ? 'alert' : 'status'}
      className={`${estilos} mb-4 rounded-md border-l-4 bg-white px-3 py-2 text-sm font-medium`}
    >
      {children}
    </p>
  );
}

export function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-tinta font-semibold underline underline-offset-4 hover:no-underline"
    >
      {children}
    </Link>
  );
}
