import { useId, type ReactNode } from 'react';
import { esNegativo } from '@/lib/reportes/tablero';
import type { ResumenReporte } from '@/lib/servidor/esquemas-reportes';
import { formatearEntero, formatearMonto } from '@/lib/formato';

interface MetricasProps {
  readonly resumen: ResumenReporte;
}

interface GrupoProps {
  readonly titulo: string;
  readonly children: ReactNode;
}

/** Una "selección" del boleto: un grupo de métricas con su corte perforado arriba. */
function Grupo({ titulo, children }: GrupoProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-perforado border-t-2 border-dashed pt-3">
      <h3 id={id} className="font-display text-2xl font-semibold">
        {titulo}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </section>
  );
}

function Cifra({ termino, valor }: { readonly termino: string; readonly valor: string }) {
  return (
    <div>
      <dt className="text-tinta-suave text-sm">{termino}</dt>
      <dd className="text-xl font-semibold">{valor}</dd>
    </div>
  );
}

/** El volumen apostado encabeza; GGR y premios lo acompañan; el resto se agrupa debajo. */
function Principal({ resumen }: MetricasProps) {
  const { apuestas } = resumen;
  return (
    <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
      <div>
        <p className="text-tinta-suave font-semibold">Volumen apostado</p>
        <p className="text-5xl leading-none font-semibold break-all sm:text-6xl">
          {formatearMonto(apuestas.volumen)}
        </p>
        <p className="mt-2">
          {formatearEntero(apuestas.cantidad)} apuestas de{' '}
          {formatearEntero(apuestas.usuariosActivos)} usuarios activos
        </p>
      </div>
      <div>
        <p className="text-tinta-suave font-semibold">GGR</p>
        <p className="text-3xl font-semibold">{formatearMonto(apuestas.ggr)}</p>
        <p className="text-tinta-suave text-sm">
          {esNegativo(apuestas.ggr)
            ? 'Negativo: los premios superaron lo apostado en apuestas liquidadas.'
            : 'Apuestas ganadas y perdidas menos premios pagados.'}
        </p>
      </div>
      <div>
        <p className="text-tinta-suave font-semibold">Premios pagados</p>
        <p className="text-3xl font-semibold">{formatearMonto(apuestas.premiosPagados)}</p>
      </div>
    </div>
  );
}

/** Tarjetas de métricas: todas las cifras las calcula reportes; aquí solo se formatean. */
export function Metricas({ resumen }: MetricasProps) {
  const { depositos, retiros, cupones, alertas } = resumen;
  return (
    <section aria-label="Métricas del periodo" className="mt-6">
      <Principal resumen={resumen} />
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Grupo titulo="Depósitos y retiros">
          <Cifra termino="Depósitos" valor={formatearMonto(depositos.monto)} />
          <Cifra termino="Confirmados" valor={formatearEntero(depositos.cantidad)} />
          <Cifra termino="Retiros" valor={formatearMonto(retiros.monto)} />
          <Cifra termino="Pagados" valor={formatearEntero(retiros.cantidad)} />
        </Grupo>
        <Grupo titulo="Cupones">
          <Cifra termino="Canjes aceptados" valor={formatearEntero(cupones.canjesAceptados)} />
          <Cifra termino="Canjes rechazados" valor={formatearEntero(cupones.canjesRechazados)} />
          <Cifra termino="Bono otorgado" valor={formatearMonto(cupones.bonoOtorgado)} />
        </Grupo>
        <Grupo titulo="Alertas de fraude">
          <Cifra termino="Abiertas" valor={formatearEntero(alertas.abiertas)} />
          <Cifra termino="Confirmadas" valor={formatearEntero(alertas.confirmadas)} />
          <Cifra termino="Descartadas" valor={formatearEntero(alertas.descartadas)} />
          <Cifra
            termino="Altas y medias"
            valor={`${formatearEntero(alertas.altas)} y ${formatearEntero(alertas.medias)}`}
          />
        </Grupo>
      </div>
    </section>
  );
}
