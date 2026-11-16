'use client';

import type { ConsumoProveedorDto } from '@apuestas/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Tarjeta } from '@/components/ui';
import { operador } from '@/lib/partidos/api';

/**
 * HU5 (T036): consultas a API-Football del día frente al presupuesto (FR-010). Si se agotó, el operador puede
 * seguir cargando resultados a mano: la liquidación funciona igual.
 */
export default function PaginaConsumoProveedor() {
  const [consumo, setConsumo] = useState<ConsumoProveedorDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    operador
      .consumoProveedor()
      .then(setConsumo)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo cargar el consumo.'),
      );
  }, []);

  const porcentaje = consumo
    ? Math.min(100, Math.round((consumo.consultas / consumo.limite) * 100))
    : 0;

  return (
    <Tarjeta antetitulo="Operador" titulo="Consumo del proveedor">
      <Link href="/operador/partidos" className="text-sm underline underline-offset-4">
        Todos los partidos
      </Link>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {consumo && (
        <div className="mt-4">
          <p className="font-display text-5xl font-bold tabular-nums">
            {consumo.consultas}{' '}
            <span className="text-tinta-suave text-2xl">de {consumo.limite}</span>
          </p>
          <p className="text-tinta-suave mb-3">
            consultas a API-Football hoy ({consumo.fecha}, hora UTC)
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={consumo.limite}
            aria-valuenow={consumo.consultas}
            aria-label="Consultas usadas del presupuesto diario"
            className="bg-pista mb-4 h-3 overflow-hidden rounded-full"
          >
            <div
              className={`h-full ${consumo.agotado ? 'bg-falla' : 'bg-tinta'}`}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          {consumo.agotado ? (
            <Aviso tipo="error">
              Presupuesto agotado: no se consultará al proveedor hasta mañana. Carga los resultados
              a mano desde el panel de partidos.
            </Aviso>
          ) : (
            <Aviso tipo="info">Queda presupuesto: la importación sigue con normalidad.</Aviso>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
