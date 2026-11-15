import { Suspense } from 'react';
import { Tarjeta } from '@/components/ui';
import { DetalleUsuario } from './detalle-usuario';

/** El id sale de la URL en el navegador: con cacheComponents va dentro de un <Suspense>. */
export default function PaginaDetalleUsuario() {
  return (
    <Suspense
      fallback={
        <Tarjeta antetitulo="Administración" titulo="Usuario">
          <p className="text-tinta-suave">Cargando…</p>
        </Tarjeta>
      }
    >
      <DetalleUsuario />
    </Suspense>
  );
}
