import type { ResumenServicio, Situacion } from '@/lib/salud';

interface EstadoServicioProps {
  readonly nombre: string;
  /** Qué hace el servicio, en palabras del usuario. */
  readonly funcion: string;
  readonly resumen: ResumenServicio;
}

const ETIQUETAS: Readonly<Record<Situacion, string>> = {
  operativo: 'Operativo',
  caido: 'No disponible',
  'sin-respuesta': 'No responde',
};

const ESTILO_ETIQUETA: Readonly<Record<Situacion, string>> = {
  operativo: 'border-ok text-ok',
  caido: 'border-falla text-falla',
  'sin-respuesta': 'border-falla bg-falla text-papel',
};

/** Una "selección" del boleto: un servicio con su estado y el de sus dependencias. */
export function EstadoServicio({ nombre, funcion, resumen }: EstadoServicioProps) {
  const id = `servicio-${nombre.toLowerCase()}`;
  return (
    <li aria-labelledby={id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 py-4">
      <div>
        <h2 id={id} className="font-display text-2xl leading-tight font-semibold">
          {nombre}
        </h2>
        <p className="text-tinta-suave text-sm">{funcion}</p>
      </div>
      <p
        className={`self-start rounded-sm border-2 px-2 py-0.5 font-display text-base font-semibold ${ESTILO_ETIQUETA[resumen.situacion]}`}
      >
        {ETIQUETAS[resumen.situacion]}
      </p>
      {resumen.dependencias.length > 0 && (
        <dl className="col-span-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {resumen.dependencias.map((dependencia) => (
            <div key={dependencia.clave} className="flex gap-1.5">
              <dt className="text-tinta-suave">{dependencia.nombre}</dt>
              <dd className={dependencia.ok ? 'tabular-nums' : 'text-falla font-semibold'}>
                {dependencia.ok ? `${dependencia.latenciaMs} ms` : 'Sin respuesta'}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {resumen.version && <p className="text-tinta-suave col-span-2 text-xs">v{resumen.version}</p>}
    </li>
  );
}
