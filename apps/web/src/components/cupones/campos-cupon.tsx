import { TIPOS_CUPON, type TipoCupon } from '@apuestas/shared';
import { Campo } from '@/components/comun/campo';
import { CAMPO, ERROR_CAMPO } from '@/components/comun/estilos';
import type { CampoCupon, ErroresCupon, ValoresCupon } from '@/lib/cupones/formulario';
import { DESCRIPCION_TIPO, NOMBRE_TIPO } from '@/lib/cupones/textos';

/** Piezas del formulario "Crear cupón". Cada control lleva su etiqueta, su ayuda y su error. */

interface CamposProps {
  readonly valores: ValoresCupon;
  readonly errores: ErroresCupon;
}

interface CampoTextoProps extends CamposProps {
  readonly campo: CampoCupon;
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly tipo?: 'text' | 'datetime-local' | 'number';
  readonly modo?: 'decimal' | 'numeric' | 'text';
  readonly predeterminado?: string;
}

function CampoTexto(props: CampoTextoProps) {
  const { campo, etiqueta, ayuda, tipo = 'text', modo, valores, errores, predeterminado } = props;
  return (
    <Campo id={`cupon-${campo}`} etiqueta={etiqueta} ayuda={ayuda} error={errores[campo]}>
      {(atributos) => (
        <input
          {...atributos}
          name={campo}
          type={tipo}
          inputMode={modo}
          required
          autoComplete="off"
          defaultValue={valores[campo] ?? predeterminado ?? ''}
          className={CAMPO}
        />
      )}
    </Campo>
  );
}

interface SelectorTipoProps {
  readonly tipo: TipoCupon | undefined;
  readonly error?: string;
  readonly alCambiar: (tipo: TipoCupon) => void;
}

/** Tres opciones con su explicación; al elegir una solo se muestran los campos de ese tipo. */
export function SelectorTipo({ tipo, error, alCambiar }: SelectorTipoProps) {
  return (
    <fieldset aria-describedby={error ? 'cupon-tipo-error' : undefined}>
      <legend className="font-semibold">Tipo de cupón</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-3">
        {TIPOS_CUPON.map((opcion) => (
          <label
            key={opcion}
            className="border-perforado hover:border-tinta-suave has-[:checked]:border-tinta has-[:checked]:bg-papel-hondo flex cursor-pointer gap-2 rounded-md border-2 p-3"
          >
            <input
              type="radio"
              name="tipo"
              value={opcion}
              checked={tipo === opcion}
              onChange={() => alCambiar(opcion)}
              className="accent-tinta mt-1 size-4 shrink-0"
            />
            <span>
              <span className="block font-semibold">{NOMBRE_TIPO[opcion]}</span>
              <span className="text-tinta-suave block text-sm">{DESCRIPCION_TIPO[opcion]}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id="cupon-tipo-error" className={ERROR_CAMPO}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function CampoCodigo(props: CamposProps) {
  return (
    <CampoTexto
      {...props}
      campo="codigo"
      etiqueta="Código"
      ayuda="De 4 a 20 letras o números. Se guarda en mayúsculas: «bienvenida» y «BIENVENIDA» son el mismo código."
    />
  );
}

interface CamposDelTipoProps extends CamposProps {
  readonly tipo: TipoCupon | undefined;
}

/** Valor y condiciones: solo los campos del tipo elegido (la API rechaza los de otro tipo). */
export function CamposDelTipo({ tipo, ...props }: CamposDelTipoProps) {
  switch (tipo) {
    case 'BONO_DEPOSITO':
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto
            {...props}
            campo="porcentaje"
            etiqueta="Porcentaje del depósito"
            ayuda="De 1 a 200 %."
            modo="decimal"
          />
          <CampoTexto
            {...props}
            campo="topeBono"
            etiqueta="Tope del bono (USD)"
            ayuda="Lo máximo que recibe de bono."
            modo="decimal"
          />
          <CampoTexto
            {...props}
            campo="depositoMinimo"
            etiqueta="Depósito mínimo (USD)"
            ayuda="Escribe 0 si no hay mínimo."
            modo="decimal"
          />
        </div>
      );
    case 'APUESTA_GRATIS':
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto
            {...props}
            campo="montoFijo"
            etiqueta="Monto de la apuesta gratis (USD)"
            ayuda="La apuesta no puede superarlo."
            modo="decimal"
          />
        </div>
      );
    case 'AUMENTO_CUOTA':
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto
            {...props}
            campo="porcentaje"
            etiqueta="Aumento de la cuota"
            ayuda="De 1 a 100 % sobre la cuota total."
            modo="decimal"
          />
          <CampoTexto
            {...props}
            campo="apuestaMaxima"
            etiqueta="Apuesta máxima (USD)"
            ayuda="Monto máximo de la apuesta con este cupón."
            modo="decimal"
          />
        </div>
      );
    default:
      return <p className="text-tinta-suave">Elige un tipo para ver su valor y sus condiciones.</p>;
  }
}

export function CamposVigenciaYCupo(props: CamposProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CampoTexto
        {...props}
        campo="iniciaEn"
        etiqueta="Inicio"
        ayuda="Hora de Ecuador (UTC−5)."
        tipo="datetime-local"
      />
      <CampoTexto
        {...props}
        campo="terminaEn"
        etiqueta="Fin"
        ayuda="Hora de Ecuador (UTC−5)."
        tipo="datetime-local"
      />
      <CampoTexto
        {...props}
        campo="cupoTotal"
        etiqueta="Cupo total"
        ayuda="Canjes entre todos los apostadores."
        tipo="number"
        modo="numeric"
      />
      <CampoTexto
        {...props}
        campo="limitePorUsuario"
        etiqueta="Límite por persona"
        ayuda="Veces que una misma persona puede usarlo."
        tipo="number"
        modo="numeric"
        predeterminado="1"
      />
    </div>
  );
}
