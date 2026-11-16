import type { ReactNode } from 'react';
import { Boleto } from '@/components/boleto/boleto';
import { ProveedorBoleto } from '@/components/boleto/contexto-boleto';

/**
 * La cartelera y el detalle comparten el boleto: en pantallas anchas queda fijo a la derecha, como el boleto sobre
 * el mostrador; en el móvil (desde 360 px) va debajo del contenido.
 */
export default function LayoutPartidos({ children }: { children: ReactNode }) {
  return (
    <ProveedorBoleto>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="min-w-0">{children}</div>
        <div className="lg:sticky lg:top-6">
          <Boleto />
        </div>
      </div>
    </ProveedorBoleto>
  );
}
