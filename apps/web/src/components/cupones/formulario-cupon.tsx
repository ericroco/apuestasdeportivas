'use client';

import { TIPOS_CUPON, type TipoCupon } from '@apuestas/shared';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { BOTON_PRIMARIO, ENLACE } from '@/components/comun/estilos';
import {
  FORMULARIO_INICIAL,
  type CampoCupon,
  type EstadoFormularioCupon,
} from '@/lib/cupones/formulario';
import { CampoCodigo, CamposDelTipo, CamposVigenciaYCupo, SelectorTipo } from './campos-cupon';

export type AccionCrearCupon = (
  previo: EstadoFormularioCupon,
  formData: FormData,
) => Promise<EstadoFormularioCupon>;

interface FormularioCuponProps {
  readonly accion: AccionCrearCupon;
}

const NOMBRE_CAMPO: Readonly<Record<CampoCupon, string>> = {
  codigo: 'código',
  tipo: 'tipo',
  porcentaje: 'porcentaje',
  montoFijo: 'monto de la apuesta gratis',
  topeBono: 'tope del bono',
  depositoMinimo: 'depósito mínimo',
  apuestaMaxima: 'apuesta máxima',
  iniciaEn: 'inicio',
  terminaEn: 'fin',
  cupoTotal: 'cupo total',
  limitePorUsuario: 'límite por persona',
};

function tipoInicial(valor: string | undefined): TipoCupon | undefined {
  return TIPOS_CUPON.find((tipo) => tipo === valor);
}

/** Resumen que se anuncia al volver con errores: dice cuántos campos corregir y cuáles. */
function ResumenErrores({ estado }: { readonly estado: EstadoFormularioCupon }) {
  const campos = Object.keys(estado.errores) as CampoCupon[];
  const texto =
    estado.mensaje ??
    (campos.length > 0
      ? `Revisa ${campos.length === 1 ? 'el campo' : 'los campos'}: ${campos.map((c) => NOMBRE_CAMPO[c]).join(', ')}.`
      : '');
  return (
    <p role="alert" className="text-falla font-semibold empty:hidden">
      {texto}
    </p>
  );
}

/** "Crear cupón": la Server Action valida y crea en la API; al crear, lleva al detalle del cupón. */
export function FormularioCupon({ accion }: FormularioCuponProps) {
  const [estado, despachar, pendiente] = useActionState(accion, FORMULARIO_INICIAL);
  const [tipo, setTipo] = useState(() => tipoInicial(estado.valores.tipo));
  const campos = { valores: estado.valores, errores: estado.errores };
  return (
    <form
      key={estado.intento}
      action={despachar}
      noValidate
      aria-busy={pendiente}
      className="flex flex-col gap-6"
    >
      <ResumenErrores estado={estado} />
      <fieldset className="flex flex-col gap-4">
        <legend className="font-display mb-2 text-2xl font-bold">Código y tipo</legend>
        <CampoCodigo {...campos} />
        <SelectorTipo tipo={tipo} error={estado.errores.tipo} alCambiar={setTipo} />
      </fieldset>
      <fieldset>
        <legend className="font-display mb-2 text-2xl font-bold">Valor y condiciones</legend>
        <CamposDelTipo tipo={tipo} {...campos} />
      </fieldset>
      <fieldset>
        <legend className="font-display mb-2 text-2xl font-bold">Vigencia y cupo</legend>
        <CamposVigenciaYCupo {...campos} />
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="submit" disabled={pendiente} className={BOTON_PRIMARIO}>
          Crear cupón
        </button>
        <Link href="/operador/cupones" className={ENLACE}>
          Volver a la lista sin crear
        </Link>
      </div>
    </form>
  );
}
