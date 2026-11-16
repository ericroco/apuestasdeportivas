import { Suspense } from 'react';
import { Tarjeta } from '@/components/ui';
import { GestionPartido } from './gestion-partido';

/** El id sale de la URL en el navegador: con cacheComponents va dentro de un <Suspense>. */
export default function PaginaGestionPartido() {
  return (
    <Suspense
      fallback={
        <Tarjeta antetitulo="Operador" titulo="Partido">
          <p className="text-tinta-suave">Cargando…</p>
        </Tarjeta>
      }
    >
      <GestionPartido />
    </Suspense>
  );
}
