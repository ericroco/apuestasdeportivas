'use client';

import type { VistaCupon } from '@apuestas/shared';
import { useActionState, useId, type ReactNode } from 'react';
import { Campo } from '@/components/comun/campo';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CAMPO } from '@/components/comun/estilos';
import { MensajeAccion } from '@/components/comun/mensaje-accion';
import { ACCION_INICIAL, type EstadoAccion } from '@/lib/acciones';
import { aFechaHoraLocal } from '@/lib/formato';

export type AccionCupon = (previo: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

type DatosCupon = Pick<VistaCupon, 'estado' | 'terminaEn' | 'cupoTotal'>;

interface AccionesCuponProps {
  readonly cupon: DatosCupon;
  readonly cambiarEstado: AccionCupon;
  readonly extenderVigencia: AccionCupon;
  readonly ampliarCupo: AccionCupon;
}

interface BloqueProps {
  readonly titulo: string;
  readonly descripcion: string;
  readonly accion: AccionCupon;
  readonly children: (pendiente: boolean) => ReactNode;
}

/** Un formulario por acción, con su propio resultado anunciado en una región viva. */
function Bloque({ titulo, descripcion, accion, children }: BloqueProps) {
  const [estado, despachar, pendiente] = useActionState(accion, ACCION_INICIAL);
  const id = useId();
  return (
    <form
      action={despachar}
      noValidate
      aria-labelledby={id}
      aria-busy={pendiente}
      className="border-perforado flex flex-col gap-3 border-t-2 border-dashed pt-3"
    >
      <div>
        <h3 id={id} className="font-display text-2xl leading-tight font-semibold">
          {titulo}
        </h3>
        <p className="text-tinta-suave text-sm">{descripcion}</p>
      </div>
      {children(pendiente)}
      <MensajeAccion estado={estado} />
    </form>
  );
}

interface AccionProps {
  readonly cupon: DatosCupon;
  readonly accion: AccionCupon;
}

function PausarOReactivar({ cupon, accion }: AccionProps) {
  const pausado = cupon.estado === 'PAUSADO';
  return (
    <Bloque
      titulo={pausado ? 'Reactivar' : 'Pausar'}
      descripcion={
        pausado
          ? 'Vuelve a aceptar canjes nuevos dentro de su vigencia.'
          : 'Deja de aceptar canjes nuevos hasta que lo reactives.'
      }
      accion={accion}
    >
      {(pendiente) => (
        <>
          <input type="hidden" name="estado" value={pausado ? 'ACTIVO' : 'PAUSADO'} />
          <button
            type="submit"
            disabled={pendiente}
            className={`${pausado ? BOTON_PRIMARIO : BOTON_SECUNDARIO} self-start`}
          >
            {pausado ? 'Reactivar cupón' : 'Pausar cupón'}
          </button>
        </>
      )}
    </Bloque>
  );
}

function ExtenderVigencia({ cupon, accion }: AccionProps) {
  const finActual = aFechaHoraLocal(cupon.terminaEn);
  return (
    <Bloque
      titulo="Extender vigencia"
      descripcion="El nuevo fin debe ser posterior al actual."
      accion={accion}
    >
      {(pendiente) => (
        <>
          <Campo id="nuevo-fin" etiqueta="Nuevo fin (hora de Ecuador)">
            {(atributos) => (
              <input
                {...atributos}
                name="terminaEn"
                type="datetime-local"
                required
                min={finActual}
                defaultValue={finActual}
                className={CAMPO}
              />
            )}
          </Campo>
          <button type="submit" disabled={pendiente} className={`${BOTON_SECUNDARIO} self-start`}>
            Extender vigencia
          </button>
        </>
      )}
    </Bloque>
  );
}

function AmpliarCupo({ cupon, accion }: AccionProps) {
  return (
    <Bloque
      titulo="Ampliar cupo"
      descripcion={`Hoy admite ${cupon.cupoTotal} canjes; el nuevo cupo debe ser mayor.`}
      accion={accion}
    >
      {(pendiente) => (
        <>
          <Campo id="nuevo-cupo" etiqueta="Nuevo cupo total">
            {(atributos) => (
              <input
                {...atributos}
                name="cupoTotal"
                type="number"
                inputMode="numeric"
                required
                min={cupon.cupoTotal + 1}
                step={1}
                defaultValue={cupon.cupoTotal + 1}
                className={CAMPO}
              />
            )}
          </Campo>
          <button type="submit" disabled={pendiente} className={`${BOTON_SECUNDARIO} self-start`}>
            Ampliar cupo
          </button>
        </>
      )}
    </Bloque>
  );
}

/** Lo que el operador puede cambiar siempre: pausar o reactivar, extender la vigencia y ampliar el cupo. */
export function AccionesCupon(props: AccionesCuponProps) {
  return (
    <section aria-labelledby="titulo-acciones" className="mt-8">
      <h2 id="titulo-acciones" className="font-display text-3xl font-bold">
        Cambiar el cupón
      </h2>
      <p className="text-tinta-suave mb-4 text-sm">
        El tipo y el valor no cambian cuando ya hay canjes. Los canjes hechos se mantienen.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        <PausarOReactivar cupon={props.cupon} accion={props.cambiarEstado} />
        <ExtenderVigencia cupon={props.cupon} accion={props.extenderVigencia} />
        <AmpliarCupo cupon={props.cupon} accion={props.ampliarCupo} />
      </div>
    </section>
  );
}
