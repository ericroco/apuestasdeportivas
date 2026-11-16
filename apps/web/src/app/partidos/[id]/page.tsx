import { Suspense } from 'react';
import { DetallePartido } from './detalle-partido';

/** El id sale de la URL en el navegador: con cacheComponents va dentro de un <Suspense>. */
export default function PaginaDetallePartido() {
  return (
    <Suspense fallback={<p className="text-papel">Cargando el partido…</p>}>
      <DetallePartido />
    </Suspense>
  );
}
