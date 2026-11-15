import { ESTADOS_ALERTA, REGLAS_FRAUDE, SEVERIDADES_ALERTA } from '@apuestas/shared';
import Link from 'next/link';
import { BOTON_SECUNDARIO, CAMPO, ENLACE, ETIQUETA_CAMPO } from '@/components/comun/estilos';
import type { FiltrosAlertas as Filtros } from '@/lib/alertas/filtros';
import { NOMBRE_ESTADO_ALERTA, NOMBRE_REGLA, NOMBRE_SEVERIDAD } from '@/lib/alertas/textos';

interface FiltrosAlertasProps {
  readonly filtros: Filtros;
}

interface SelectorProps<T extends string> {
  readonly id: string;
  readonly nombre: string;
  readonly etiqueta: string;
  readonly valor: T | undefined;
  readonly opciones: readonly T[];
  readonly nombres: Readonly<Record<T, string>>;
}

function Selector<T extends string>({
  id,
  nombre,
  etiqueta,
  valor,
  opciones,
  nombres,
}: SelectorProps<T>) {
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA_CAMPO}>
        {etiqueta}
      </label>
      <select id={id} name={nombre} defaultValue={valor ?? ''} className={CAMPO}>
        <option value="">Todas</option>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {nombres[opcion]}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CampoTextoProps {
  readonly id: string;
  readonly nombre: string;
  readonly etiqueta: string;
  readonly valor: string | undefined;
  readonly tipo: 'search' | 'date';
}

function CampoTexto({ id, nombre, etiqueta, valor, tipo }: CampoTextoProps) {
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
        autoComplete="off"
        maxLength={100}
        className={CAMPO}
      />
    </div>
  );
}

function Selectores({ filtros }: FiltrosAlertasProps) {
  return (
    <>
      <Selector
        id="filtro-estado"
        nombre="estado"
        etiqueta="Estado"
        valor={filtros.estado}
        opciones={ESTADOS_ALERTA}
        nombres={NOMBRE_ESTADO_ALERTA}
      />
      <Selector
        id="filtro-severidad"
        nombre="severidad"
        etiqueta="Severidad"
        valor={filtros.severidad}
        opciones={SEVERIDADES_ALERTA}
        nombres={NOMBRE_SEVERIDAD}
      />
      <Selector
        id="filtro-regla"
        nombre="regla"
        etiqueta="Regla"
        valor={filtros.regla}
        opciones={REGLAS_FRAUDE}
        nombres={NOMBRE_REGLA}
      />
    </>
  );
}

/** Filtros en la URL (`?estado=&severidad=&regla=&usuarioId=&desde=&hasta=`), con un GET sin JavaScript. */
export function FiltrosAlertas({ filtros }: FiltrosAlertasProps) {
  return (
    <form
      method="get"
      action="/admin/alertas"
      aria-label="Filtrar alertas"
      className="bg-papel-hondo -mx-4 mb-2 grid gap-3 px-4 py-4 sm:-mx-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-3"
    >
      <Selectores filtros={filtros} />
      <CampoTexto
        id="filtro-usuario"
        nombre="usuarioId"
        etiqueta="Usuario (identificador)"
        valor={filtros.usuarioId}
        tipo="search"
      />
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto
          id="filtro-desde"
          nombre="desde"
          etiqueta="Desde"
          valor={filtros.desde}
          tipo="date"
        />
        <CampoTexto
          id="filtro-hasta"
          nombre="hasta"
          etiqueta="Hasta"
          valor={filtros.hasta}
          tipo="date"
        />
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <button type="submit" className={BOTON_SECUNDARIO}>
          Filtrar alertas
        </button>
        <Link href="/admin/alertas" className={`${ENLACE} pb-2.5`}>
          Quitar filtros
        </Link>
      </div>
    </form>
  );
}
