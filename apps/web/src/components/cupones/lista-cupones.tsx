import type { VistaCupon } from '@apuestas/shared';
import Link from 'next/link';
import { ENLACE } from '@/components/comun/estilos';
import { NOMBRE_TIPO, condicionesCupon, valorCupon } from '@/lib/cupones/textos';
import { EstadoCupon } from './estado-cupon';
import { formatearEntero, formatearFecha } from '@/lib/formato';

/** La fila y la cabecera comparten columnas: el código y, a su derecha, los datos del cupón. */
const COLUMNAS_FILA = 'md:grid-cols-[minmax(0,1.1fr)_minmax(0,5fr)]';
const COLUMNAS_DATOS =
  'sm:grid-cols-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_7.5rem]';

interface ListaCuponesProps {
  readonly cupones: readonly VistaCupon[];
  readonly hayFiltros: boolean;
}

/** Medidor del cupo usado: decorativo, el texto "40 de 500" lleva el dato. */
function MedidorCupo({ canjes, cupoTotal }: Pick<VistaCupon, 'canjes' | 'cupoTotal'>) {
  const ancho = cupoTotal > 0 ? Math.min(100, (canjes / cupoTotal) * 100) : 0;
  return (
    <span
      aria-hidden="true"
      className="bg-papel-hondo mt-1 block h-1.5 w-full max-w-32 rounded-full"
    >
      <span className="bg-serie block h-full rounded-full" style={{ width: `${ancho}%` }} />
    </span>
  );
}

function FilaCupon({ cupon }: { readonly cupon: VistaCupon }) {
  return (
    <li className={`grid gap-x-6 gap-y-2 py-4 ${COLUMNAS_FILA}`}>
      <div>
        <Link
          href={`/operador/cupones/${encodeURIComponent(cupon.id)}`}
          className="font-display text-2xl leading-tight font-bold break-all underline-offset-4 hover:underline"
        >
          {cupon.codigo}
        </Link>
        <p className="text-tinta-suave text-sm">{NOMBRE_TIPO[cupon.tipo]}</p>
      </div>
      <dl className={`grid gap-x-6 gap-y-2 ${COLUMNAS_DATOS}`}>
        <div>
          <dt className="text-tinta-suave text-sm md:sr-only">Valor</dt>
          <dd>{valorCupon(cupon)}</dd>
          <dd className="text-tinta-suave text-sm">{condicionesCupon(cupon)}</dd>
        </div>
        <div>
          <dt className="text-tinta-suave text-sm md:sr-only">Vigencia</dt>
          <dd>
            {formatearFecha(cupon.iniciaEn)} al {formatearFecha(cupon.terminaEn)}
          </dd>
        </div>
        <div>
          <dt className="text-tinta-suave text-sm md:sr-only">Canjes</dt>
          <dd className="tabular-nums">
            {formatearEntero(cupon.canjes)} de {formatearEntero(cupon.cupoTotal)}
            <MedidorCupo canjes={cupon.canjes} cupoTotal={cupon.cupoTotal} />
          </dd>
        </div>
        <div>
          <dt className="sr-only">Estado</dt>
          <dd>
            <EstadoCupon cupon={cupon} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** Lista de cupones: filas de un boleto en móvil y columnas alineadas desde 768 px. */
export function ListaCupones({ cupones, hayFiltros }: ListaCuponesProps) {
  if (cupones.length === 0) {
    return (
      <div className="py-8">
        <p className="font-display text-2xl font-semibold">
          {hayFiltros ? 'Ningún cupón cumple estos filtros.' : 'Todavía no hay cupones.'}
        </p>
        <p className="mt-1">
          {hayFiltros ? (
            <Link href="/operador/cupones" className={ENLACE}>
              Quitar filtros
            </Link>
          ) : (
            <Link href="/operador/cupones/nuevo" className={ENLACE}>
              Crear el primer cupón
            </Link>
          )}
        </p>
      </div>
    );
  }
  return (
    <div>
      <div
        aria-hidden="true"
        className={`text-tinta-suave border-tinta hidden gap-x-6 border-b-2 pb-2 text-sm font-semibold md:grid ${COLUMNAS_FILA}`}
      >
        <span>Código</span>
        <span className={`grid gap-x-6 ${COLUMNAS_DATOS}`}>
          <span>Valor</span>
          <span>Vigencia</span>
          <span>Canjes</span>
          <span>Estado</span>
        </span>
      </div>
      <ul aria-label="Cupones" className="divide-perforado divide-y-2 divide-dashed">
        {cupones.map((cupon) => (
          <FilaCupon key={cupon.id} cupon={cupon} />
        ))}
      </ul>
    </div>
  );
}
