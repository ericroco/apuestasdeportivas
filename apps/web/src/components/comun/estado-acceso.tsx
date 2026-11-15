import { useId } from 'react';
import type { FalloConsulta } from '@/lib/resultado';
import { ENLACE } from './estilos';

interface EstadoAccesoProps {
  readonly fallo: FalloConsulta;
  /** Quién puede usar la sección, p. ej. "operador o administrador". */
  readonly rol: string;
  /** Qué se consultó, p. ej. "los cupones". */
  readonly que: string;
  /** URL actual, con sus filtros, para reintentar con una recarga completa. */
  readonly reintentarHref: string;
}

interface Texto {
  readonly titulo: string;
  readonly detalle: string;
  readonly tono: string;
}

function texto(fallo: FalloConsulta, rol: string, que: string): Texto {
  switch (fallo.tipo) {
    case 'sin-sesion':
      return {
        titulo: 'Inicia sesión',
        detalle: `Para ver ${que} necesitas una sesión de ${rol}. Tu sesión no está activa o venció: inicia sesión y vuelve a esta página.`,
        tono: 'border-tinta',
      };
    case 'sin-permiso':
      return {
        titulo: 'No tienes permiso para ver esta sección',
        detalle: `Esta sección es solo para ${rol}. Si la necesitas, pide el rol a un administrador.`,
        tono: 'border-tinta',
      };
    case 'no-disponible':
      return {
        titulo: 'El servicio no está disponible, reintenta',
        detalle:
          fallo.codigo === 'DATOS_NO_DISPONIBLES'
            ? 'El servicio de reportes todavía no tiene los datos de apuestas, depósitos o retiros que necesita. No se muestran cifras incompletas.'
            : `No se pudo consultar ${que}. No se muestran datos anteriores para no confundirlos con los actuales.`,
        tono: 'border-falla',
      };
    case 'rechazo':
      return { titulo: `No se pudo cargar ${que}`, detalle: fallo.mensaje, tono: 'border-falla' };
  }
}

/** Lo que ve quien abre una pantalla sin sesión, sin el rol o con el servicio caído. */
export function EstadoAcceso({ fallo, rol, que, reintentarHref }: EstadoAccesoProps) {
  const id = useId();
  const { titulo, detalle, tono } = texto(fallo, rol, que);
  const puedeReintentar = fallo.tipo === 'no-disponible' || fallo.tipo === 'rechazo';
  return (
    <section aria-labelledby={id} className={`my-4 border-l-4 py-1 pl-4 ${tono}`}>
      <h2 id={id} className="font-display text-3xl leading-tight font-bold">
        {titulo}
      </h2>
      <p className="mt-1 max-w-prose">{detalle}</p>
      {puedeReintentar && (
        // Recarga completa: vuelve a consultar desde el servidor con los mismos filtros.
        <a href={reintentarHref} className={`${ENLACE} mt-3 inline-block`}>
          Reintentar
        </a>
      )}
    </section>
  );
}
