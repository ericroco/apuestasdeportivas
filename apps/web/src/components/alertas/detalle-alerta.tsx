import type { VistaAlerta } from '@apuestas/shared';
import type { ReactNode } from 'react';
import { NOMBRE_ESTADO_ALERTA, NOMBRE_SEVERIDAD, describirEvidencia } from '@/lib/alertas/textos';
import { formatearFechaHora } from '@/lib/formato';
import { EtiquetaEstadoAlerta } from './etiquetas-alerta';

interface DetalleAlertaProps {
  readonly alerta: VistaAlerta;
}

const TITULO_SECCION = 'font-display mt-8 mb-2 text-3xl font-bold';

function Dato({ termino, children }: { readonly termino: string; readonly children: ReactNode }) {
  return (
    <div className="border-perforado border-t-2 border-dashed pt-2">
      <dt className="text-tinta-suave text-sm">{termino}</dt>
      <dd className="mt-0.5 font-semibold break-words">{children}</dd>
    </div>
  );
}

/** La severidad como un sello estampado sobre la hoja: lo primero que ve el administrador. */
function SelloSeveridad({ alerta }: DetalleAlertaProps) {
  const alta = alerta.severidad === 'ALTA';
  return (
    <p
      className={`sello font-display inline-block rounded-md border-4 border-double px-3 py-1 text-2xl font-bold whitespace-nowrap ${
        alta ? 'border-falla text-falla' : 'border-aviso text-aviso'
      }`}
    >
      Severidad {NOMBRE_SEVERIDAD[alerta.severidad].toLowerCase()}
    </p>
  );
}

function Evidencia({ alerta }: DetalleAlertaProps) {
  const datos = describirEvidencia(alerta.evidencia);
  return (
    <section aria-labelledby="titulo-evidencia">
      <h2 id="titulo-evidencia" className={TITULO_SECCION}>
        Evidencia
      </h2>
      {datos.length === 0 ? (
        <p>La regla no dejó evidencia adicional.</p>
      ) : (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {datos.map((dato) => (
            <Dato key={dato.clave} termino={dato.etiqueta}>
              {dato.valores.length === 1 ? (
                dato.valores[0]
              ) : (
                <ul className="list-inside list-disc font-normal">
                  {dato.valores.map((valor, indice) => (
                    <li key={`${indice}-${valor}`}>{valor}</li>
                  ))}
                </ul>
              )}
            </Dato>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Lo resuelto no se vuelve a resolver: se muestra quién, cuándo y por qué. */
export function ResolucionAlerta({ alerta }: DetalleAlertaProps) {
  return (
    <section aria-labelledby="titulo-resolucion">
      <h2 id="titulo-resolucion" className={TITULO_SECCION}>
        Resolución
      </h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
        <Dato termino="Decisión">{NOMBRE_ESTADO_ALERTA[alerta.estado]}</Dato>
        <Dato termino="Resuelta por">{alerta.resueltaPor ?? 'Sin dato'}</Dato>
        <Dato termino="Fecha">
          {alerta.resueltaEn ? formatearFechaHora(alerta.resueltaEn) : 'Sin dato'}
        </Dato>
      </dl>
      <p className="mt-4 max-w-prose">
        <span className="text-tinta-suave block text-sm">Nota</span>
        {alerta.nota ?? 'Sin nota.'}
      </p>
    </section>
  );
}

/** Resumen y evidencia de una alerta de fraude. */
export function DetalleAlerta({ alerta }: DetalleAlertaProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-2">
        <SelloSeveridad alerta={alerta} />
        <dl className="grid grow gap-x-8 gap-y-3 sm:grid-cols-3">
          <Dato termino="Usuario evaluado">{alerta.usuarioId}</Dato>
          <Dato termino="Detectada">{formatearFechaHora(alerta.creadaEn)}</Dato>
          <Dato termino="Estado">
            <EtiquetaEstadoAlerta estado={alerta.estado} />
          </Dato>
        </dl>
      </div>
      <Evidencia alerta={alerta} />
    </>
  );
}
