'use client';

import type { VistaAlerta } from '@apuestas/shared';
import { useActionState, useState } from 'react';
import { Campo } from '@/components/comun/campo';
import { BOTON_PELIGRO, BOTON_SECUNDARIO, CAMPO } from '@/components/comun/estilos';
import { MensajeAccion } from '@/components/comun/mensaje-accion';
import { ACCION_INICIAL, type EstadoAccion } from '@/lib/acciones';
import { NOTA_MAXIMA, NOTA_MINIMA } from '@/lib/alertas/resolucion';
import { ResolucionAlerta } from './detalle-alerta';

export type AccionResolver = (previo: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

interface FormularioProps {
  readonly despachar: (formData: FormData) => void;
  readonly pendiente: boolean;
}

/** Cada botón envía su decisión en `estado`; la nota es obligatoria. */
function FormularioResolucion({ despachar, pendiente }: FormularioProps) {
  const [largo, setLargo] = useState(0);
  return (
    <form
      action={despachar}
      noValidate
      aria-labelledby="titulo-resolver"
      aria-busy={pendiente}
      className="bg-papel-hondo -mx-4 mt-8 flex flex-col gap-4 px-4 py-5 sm:-mx-8 sm:px-8"
    >
      <h2 id="titulo-resolver" className="font-display text-3xl font-bold">
        Resolver la alerta
      </h2>
      <Campo
        id="nota-resolucion"
        etiqueta="Nota de la resolución"
        ayuda={`Explica la decisión: de ${NOTA_MINIMA} a ${NOTA_MAXIMA} caracteres. Llevas ${largo}.`}
      >
        {(atributos) => (
          <textarea
            {...atributos}
            name="nota"
            required
            minLength={NOTA_MINIMA}
            maxLength={NOTA_MAXIMA}
            rows={4}
            onChange={(evento) => setLargo(evento.target.value.length)}
            className={`${CAMPO} max-w-2xl`}
          />
        )}
      </Campo>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="estado"
          value="CONFIRMADA"
          disabled={pendiente}
          className={BOTON_PELIGRO}
        >
          Confirmar fraude
        </button>
        <button
          type="submit"
          name="estado"
          value="DESCARTADA"
          disabled={pendiente}
          className={BOTON_SECUNDARIO}
        >
          Descartar alerta
        </button>
      </div>
    </form>
  );
}

interface PanelResolucionProps {
  readonly alerta: VistaAlerta;
  readonly accion: AccionResolver;
}

/**
 * Formulario mientras la alerta está abierta y resolución cuando ya no. La región viva queda fuera del
 * cambio: al resolver, la página se vuelve a pedir y el mensaje sigue anunciado.
 */
export function PanelResolucion({ alerta, accion }: PanelResolucionProps) {
  const [estado, despachar, pendiente] = useActionState(accion, ACCION_INICIAL);
  return (
    <>
      {alerta.estado === 'ABIERTA' ? (
        <FormularioResolucion despachar={despachar} pendiente={pendiente} />
      ) : (
        <ResolucionAlerta alerta={alerta} />
      )}
      <MensajeAccion estado={estado} className="mt-4" />
    </>
  );
}
