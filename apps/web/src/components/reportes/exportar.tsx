import { BOTON_SECUNDARIO } from '@/components/comun/estilos';
import { formatearFechaHora } from '@/lib/formato';
import type { MotivoExportacion } from '@/lib/reportes/exportacion';
import { hrefExportacion, type FiltrosReporte } from '@/lib/reportes/filtros';

interface BotonesExportarProps {
  readonly filtros: FiltrosReporte;
  readonly generadoEn: string;
}

/**
 * Descargas con los mismos filtros de la vista. Son enlaces normales (no `<Link>`): el route handler
 * transmite el archivo y no debe precargarse.
 */
export function BotonesExportar({ filtros, generadoEn }: BotonesExportarProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="text-tinta-suave text-sm">
        Calculado por el servicio de reportes el{' '}
        <time dateTime={generadoEn}>{formatearFechaHora(generadoEn)}</time>.
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={hrefExportacion(filtros, 'csv')} className={BOTON_SECUNDARIO}>
          Descargar CSV
        </a>
        <a href={hrefExportacion(filtros, 'pdf')} className={BOTON_SECUNDARIO}>
          Descargar PDF
        </a>
      </div>
    </div>
  );
}

const MENSAJES: Readonly<Record<MotivoExportacion, string>> = {
  'sin-sesion':
    'No se descargó el reporte: tu sesión no está activa o venció. Inicia sesión y vuelve a intentarlo.',
  'sin-permiso': 'No se descargó el reporte: solo un administrador puede exportarlo.',
  'no-disponible':
    'No se descargó el reporte: el servicio de reportes no está disponible, reintenta en unos minutos.',
  rechazo:
    'No se descargó el reporte: el servicio rechazó los filtros. Revísalos y vuelve a intentarlo.',
  filtros: 'No se descargó el reporte: revisa los filtros y el formato pedido.',
};

/** Aviso al volver de una descarga fallida (`?exportacion=<motivo>`). */
export function AvisoExportacion({ motivo }: { readonly motivo: MotivoExportacion }) {
  return (
    <p role="alert" className="border-falla text-falla mt-4 border-l-4 pl-3 font-semibold">
      {MENSAJES[motivo]}
    </p>
  );
}
