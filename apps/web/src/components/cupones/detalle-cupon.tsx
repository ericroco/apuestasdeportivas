import type { DetalleCupon as Detalle } from '@apuestas/shared';
import type { ReactNode } from 'react';
import { NOMBRE_TIPO, condicionesCupon, valorCupon } from '@/lib/cupones/textos';
import { formatearEntero, formatearFechaHora, formatearMonto } from '@/lib/formato';
import { EstadoCupon } from './estado-cupon';

interface DetalleCuponProps {
  readonly cupon: Detalle;
}

interface DatoProps {
  readonly termino: string;
  readonly children: ReactNode;
}

function Dato({ termino, children }: DatoProps) {
  return (
    <div className="border-perforado border-t-2 border-dashed pt-2">
      <dt className="text-tinta-suave text-sm">{termino}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{children}</dd>
    </div>
  );
}

/**
 * Lo que otorga el cupón, separado del código (en la franja de la hoja) por el corte del boleto, y sus
 * números: vigencia, cupo y canjes según la API.
 */
export function DetalleCupon({ cupon }: DetalleCuponProps) {
  return (
    <>
      <section
        aria-label="Qué otorga"
        className="corte-boleto -mx-4 -mt-4 mb-6 px-4 pt-6 pb-5 sm:-mx-8 sm:px-8"
      >
        <p className="text-tinta-suave font-semibold">{NOMBRE_TIPO[cupon.tipo]}</p>
        <p className="font-display text-3xl leading-tight font-bold sm:text-4xl">
          {valorCupon(cupon)}
        </p>
        <p className="text-tinta-suave mt-1">{condicionesCupon(cupon)}</p>
        <p className="mt-3">
          <EstadoCupon cupon={cupon} />
        </p>
      </section>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Dato termino="Vigencia (hora de Ecuador)">
          Del {formatearFechaHora(cupon.iniciaEn)} al {formatearFechaHora(cupon.terminaEn)}
        </Dato>
        <Dato termino="Canjes aceptados">
          {formatearEntero(cupon.resumenCanjes.aceptados)} de un cupo de{' '}
          {formatearEntero(cupon.cupoTotal)}
        </Dato>
        <Dato termino="Límite por persona">
          {cupon.limitePorUsuario === 1
            ? '1 canje'
            : `${formatearEntero(cupon.limitePorUsuario)} canjes`}
        </Dato>
        <Dato termino="Canjes rechazados">{formatearEntero(cupon.resumenCanjes.rechazados)}</Dato>
        <Dato termino="Bono otorgado">{formatearMonto(cupon.resumenCanjes.bonoOtorgado)}</Dato>
        <Dato termino="Creado">{formatearFechaHora(cupon.creadoEn)}</Dato>
      </dl>
    </>
  );
}
