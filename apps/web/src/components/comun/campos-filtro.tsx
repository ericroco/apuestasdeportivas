import Link from 'next/link';
import { BOTON_SECUNDARIO, CAMPO, ENLACE, ETIQUETA_CAMPO } from './estilos';

/** Controles de los formularios GET de filtros (los filtros viven en la URL y funcionan sin JS). */

interface SelectorProps<T extends string> {
  readonly id: string;
  readonly nombre: string;
  readonly etiqueta: string;
  readonly valor: T | undefined;
  readonly opciones: readonly T[];
  readonly nombres: Readonly<Record<T, string>>;
  /** Texto de la opción sin filtro, p. ej. "Todos" o "Todas". */
  readonly todos: string;
}

export function Selector<T extends string>(props: SelectorProps<T>) {
  const { id, nombre, etiqueta, valor, opciones, nombres, todos } = props;
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA_CAMPO}>
        {etiqueta}
      </label>
      <select id={id} name={nombre} defaultValue={valor ?? ''} className={CAMPO}>
        <option value="">{todos}</option>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {nombres[opcion]}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CampoFiltroProps {
  readonly id: string;
  readonly nombre: string;
  readonly etiqueta: string;
  readonly valor: string | undefined;
  readonly tipo: 'search' | 'date';
  readonly requerido?: boolean;
  readonly largoMaximo?: number;
  readonly placeholder?: string;
}

export function CampoFiltro(props: CampoFiltroProps) {
  const { id, nombre, etiqueta, valor, tipo, requerido = false, largoMaximo = 100 } = props;
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA_CAMPO}>
        {etiqueta}
      </label>
      <input
        id={id}
        name={nombre}
        type={tipo}
        defaultValue={valor ?? ''}
        required={requerido}
        placeholder={props.placeholder}
        autoComplete="off"
        maxLength={largoMaximo}
        className={CAMPO}
      />
    </div>
  );
}

interface AccionesFiltroProps {
  /** Texto del botón, que nombra la acción ("Filtrar cupones"). */
  readonly texto: string;
  /** URL de la lista sin filtros. */
  readonly limpiar: string;
}

export function AccionesFiltro({ texto, limpiar }: AccionesFiltroProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:self-end sm:pb-0.5">
      <button type="submit" className={BOTON_SECUNDARIO}>
        {texto}
      </button>
      <Link href={limpiar} className={ENLACE}>
        Quitar filtros
      </Link>
    </div>
  );
}
