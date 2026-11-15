import type { VistaAlerta } from '@apuestas/shared';
import Link from 'next/link';
import { ENLACE } from '@/components/comun/estilos';
import { NOMBRE_REGLA } from '@/lib/alertas/textos';
import { formatearFechaHora } from '@/lib/formato';
import { EtiquetaEstadoAlerta, EtiquetaSeveridad } from './etiquetas-alerta';

/** La fila y la cabecera comparten columnas. */
const COLUMNAS =
  'md:grid-cols-[6.5rem_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_10rem] md:items-start';

interface ListaAlertasProps {
  readonly alertas: readonly VistaAlerta[];
  readonly hayFiltros: boolean;
}

function FilaAlerta({ alerta }: { readonly alerta: VistaAlerta }) {
  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 py-4 ${COLUMNAS}`}>
      <p>
        <EtiquetaSeveridad severidad={alerta.severidad} />
      </p>
      <p>
        <Link
          href={`/admin/alertas/${encodeURIComponent(alerta.id)}`}
          className="font-display text-xl leading-tight font-semibold underline-offset-4 hover:underline"
        >
          {NOMBRE_REGLA[alerta.regla]}
        </Link>
      </p>
      <dl className="col-span-2 grid gap-x-4 gap-y-1 sm:grid-cols-3 md:col-span-3 md:grid-cols-subgrid">
        <div>
          <dt className="text-tinta-suave text-sm md:sr-only">Usuario</dt>
          <dd className="break-all">{alerta.usuarioId}</dd>
        </div>
        <div>
          <dt className="text-tinta-suave text-sm md:sr-only">Detectada</dt>
          <dd>{formatearFechaHora(alerta.creadaEn)}</dd>
        </div>
        <div>
          <dt className="sr-only">Estado</dt>
          <dd>
            <EtiquetaEstadoAlerta estado={alerta.estado} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** Alertas de la más reciente a la más antigua, en el orden que entrega la API. */
export function ListaAlertas({ alertas, hayFiltros }: ListaAlertasProps) {
  if (alertas.length === 0) {
    return (
      <div className="py-8">
        <p className="font-display text-2xl font-semibold">
          {hayFiltros ? 'Ninguna alerta cumple estos filtros.' : 'No hay alertas de fraude.'}
        </p>
        {hayFiltros && (
          <Link href="/admin/alertas" className={`${ENLACE} mt-1 inline-block`}>
            Quitar filtros
          </Link>
        )}
      </div>
    );
  }
  return (
    <div>
      <div
        aria-hidden="true"
        className={`text-tinta-suave border-tinta hidden gap-x-4 border-b-2 pb-2 text-sm font-semibold md:grid ${COLUMNAS}`}
      >
        <span>Severidad</span>
        <span>Regla</span>
        <span>Usuario</span>
        <span>Detectada</span>
        <span>Estado</span>
      </div>
      <ul aria-label="Alertas" className="divide-perforado divide-y-2 divide-dashed">
        {alertas.map((alerta) => (
          <FilaAlerta key={alerta.id} alerta={alerta} />
        ))}
      </ul>
    </div>
  );
}
