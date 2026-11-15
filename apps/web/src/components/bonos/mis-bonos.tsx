import type { BonoHistorial, CanjeRechazado, MisBonos as Datos, VistaBono } from '@apuestas/shared';
import { Etiqueta } from '@/components/comun/etiqueta';
import { formatearCuota, formatearFecha, formatearFechaHora, formatearMonto } from '@/lib/formato';
import { BarraAvance } from './barra-avance';

interface MisBonosProps {
  readonly bonos: Datos;
}

const TITULO_SECCION = 'font-display mt-8 mb-2 text-3xl font-bold';

/** El bono activo como un talón: el código del cupón en la franja y el monto del bono a la derecha. */
function BonoActivo({
  bono,
  cuotaMinima,
}: {
  readonly bono: VistaBono;
  readonly cuotaMinima: string;
}) {
  return (
    <section aria-label="Bono activo" className="mt-2">
      <div className="talon">
        <div className="px-5 py-4">
          <p className="font-display text-lg font-medium">Bono activo con el cupón</p>
          <p className="font-display text-4xl leading-none font-bold break-all">
            {bono.codigoCupon}
          </p>
        </div>
        <div className="talon-corte px-5 py-4">
          <p className="text-sm font-semibold">Saldo de bono otorgado</p>
          <p className="text-4xl font-semibold">{formatearMonto(bono.monto)}</p>
        </div>
      </div>
      <div className="mt-5 max-w-2xl">
        <BarraAvance
          porcentaje={bono.porcentajeAvance}
          avance={bono.avance}
          requisito={bono.requisito}
        />
        <p className="mt-3 text-lg">
          Has apostado {formatearMonto(bono.avance)} de los {formatearMonto(bono.requisito)} que
          pide el rollover.
        </p>
        <p className="mt-2">
          Vence el {formatearFechaHora(bono.venceEn)}: si no cumples el rollover antes, el bono
          vence y su saldo no pasa a tu saldo real.
        </p>
        <p className="text-tinta-suave mt-2 text-sm">
          Cuentan las apuestas ganadas o perdidas con cuota total de {formatearCuota(cuotaMinima)} o
          más, hechas después de recibir el bono. Las anuladas no cuentan.
        </p>
      </div>
    </section>
  );
}

function SinBonoActivo() {
  return (
    <section aria-label="Bono activo" className="py-4">
      <p className="font-display text-3xl font-bold">No tienes un bono activo.</p>
      <p className="mt-1 max-w-prose">
        Escribe el código de un cupón al depositar o al confirmar una apuesta. Solo puedes tener un
        bono a la vez.
      </p>
    </section>
  );
}

function FilaHistorial({ bono }: { readonly bono: BonoHistorial }) {
  const cumplido = bono.estado === 'CUMPLIDO';
  return (
    <li className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <p className="font-display text-2xl font-bold break-all">{bono.codigoCupon}</p>
        <p className="text-tinta-suave text-sm">
          Bono de {formatearMonto(bono.monto)}, otorgado el {formatearFecha(bono.otorgadoEn)}
        </p>
        <p className="mt-1">
          {cumplido && bono.montoConvertido !== null
            ? `${formatearMonto(bono.montoConvertido)} pasaron a tu saldo real el ${formatearFecha(bono.cumplidoEn ?? bono.venceEn)}.`
            : `Venció sin cumplir el rollover el ${formatearFecha(bono.venceEn)}.`}
        </p>
      </div>
      <p>
        <Etiqueta tono={cumplido ? 'ok' : 'neutro'}>{cumplido ? 'Cumplido' : 'Vencido'}</Etiqueta>
      </p>
    </li>
  );
}

function FilaRechazo({ canje }: { readonly canje: CanjeRechazado }) {
  return (
    <li className="py-3">
      <p className="font-display text-2xl font-bold break-all">{canje.codigo}</p>
      <p>{canje.motivo.mensaje}</p>
      <p className="text-tinta-suave text-sm">{formatearFechaHora(canje.creadoEn)}</p>
    </li>
  );
}

/** "Mis bonos": bono activo con su avance, bonos anteriores y canjes rechazados con su motivo. */
export function MisBonos({ bonos }: MisBonosProps) {
  return (
    <>
      {bonos.activo ? (
        <BonoActivo bono={bonos.activo} cuotaMinima={bonos.cuotaMinima} />
      ) : (
        <SinBonoActivo />
      )}
      <h2 className={TITULO_SECCION}>Bonos anteriores</h2>
      {bonos.historial.length === 0 ? (
        <p>Todavía no tienes bonos cumplidos ni vencidos.</p>
      ) : (
        <ul aria-label="Bonos anteriores" className="divide-perforado divide-y-2 divide-dashed">
          {bonos.historial.map((bono) => (
            <FilaHistorial key={bono.id} bono={bono} />
          ))}
        </ul>
      )}
      <h2 className={TITULO_SECCION}>Canjes rechazados</h2>
      {bonos.canjesRechazados.length === 0 ? (
        <p>Ningún cupón tuyo fue rechazado.</p>
      ) : (
        <ul aria-label="Canjes rechazados" className="divide-perforado divide-y-2 divide-dashed">
          {bonos.canjesRechazados.map((canje) => (
            <FilaRechazo key={`${canje.codigo}-${canje.creadoEn}`} canje={canje} />
          ))}
        </ul>
      )}
    </>
  );
}
