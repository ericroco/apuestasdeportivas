import { Suspense } from 'react';
import { EstadoServicio } from '@/components/estado-servicio';
import { obtenerEstadoSistema, resumirSalud, type ResumenServicio } from '@/lib/salud';
import paquete from '../../package.json';

const RESUMEN_WEB: ResumenServicio = {
  // Si esta página se renderizó, la web está operativa.
  situacion: 'operativo',
  version: paquete.version,
  dependencias: [],
};

const formatoHora = new Intl.DateTimeFormat('es-EC', {
  timeStyle: 'medium',
  timeZone: 'America/Guayaquil',
});

/** Consulta en cada petición (sin caché): se transmite dentro del <Suspense> de la página. */
async function EstadoSistema() {
  const { api, reportes } = await obtenerEstadoSistema({
    API_URL: process.env.API_URL,
    REPORTS_URL: process.env.REPORTS_URL,
  });
  const servicios = [
    { nombre: 'Web', funcion: 'La interfaz que estás viendo', resumen: RESUMEN_WEB },
    { nombre: 'API', funcion: 'Saldos, apuestas y liquidación', resumen: resumirSalud(api) },
    { nombre: 'Reportes', funcion: 'Dashboard de solo lectura', resumen: resumirSalud(reportes) },
  ];
  const todoOperativo = servicios.every((servicio) => servicio.resumen.situacion === 'operativo');
  const fecha = api?.fecha ?? reportes?.fecha;

  return (
    <>
      <ul className="divide-perforado divide-y px-6">
        {servicios.map((servicio) => (
          <EstadoServicio key={servicio.nombre} {...servicio} />
        ))}
      </ul>

      <footer className="corte-boleto mt-2 px-6 pt-6 pb-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-tinta-suave text-sm">
            {servicios.filter((servicio) => servicio.resumen.situacion === 'operativo').length} de{' '}
            {servicios.length} selecciones en verde
          </p>
          <p
            role="status"
            className={`sello rounded-md border-4 border-double px-3 py-1 font-display text-2xl font-bold whitespace-nowrap ${
              todoOperativo ? 'border-ok text-ok' : 'border-falla text-falla'
            }`}
          >
            {todoOperativo ? 'Todo operativo' : 'Hay fallas'}
          </p>
        </div>

        {!todoOperativo && (
          <p className="mt-4 text-sm">
            Algún servicio no responde. En local, levanta PostgreSQL y Redis con{' '}
            <code className="font-semibold">docker compose up -d</code> y las aplicaciones con{' '}
            <code className="font-semibold">pnpm dev</code>.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          {fecha && (
            <p className="text-tinta-suave">
              Comprobado a las <time dateTime={fecha}>{formatoHora.format(new Date(fecha))}</time>
            </p>
          )}
          {/* Recarga completa: vuelve a consultar los servicios desde el servidor. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="bg-tinta text-papel hover:bg-franja hover:text-tinta rounded-md px-4 py-2 font-semibold transition-colors"
          >
            Comprobar de nuevo
          </a>
        </div>
      </footer>
    </>
  );
}

function ConsultandoServicios() {
  return (
    <p aria-busy="true" className="text-tinta-suave px-6 pt-2 pb-8">
      Consultando la API y el servicio de reportes…
    </p>
  );
}

export default function Pagina() {
  return (
    <main className="px-4 py-10 sm:py-16">
      <article
        aria-labelledby="titulo"
        className="bg-papel mx-auto max-w-md overflow-hidden rounded-lg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]"
      >
        <header className="bg-franja px-6 pt-6 pb-5">
          <p className="font-display text-lg font-medium">Apuestas deportivas</p>
          <h1 id="titulo" className="font-display text-5xl leading-none font-bold">
            Estado del sistema
          </h1>
        </header>
        <p className="text-tinta-suave px-6 pt-5 text-sm">
          Como en una combinada, el sistema solo pasa si todas sus selecciones pasan. Cada visita
          consulta los servicios en vivo.
        </p>
        <Suspense fallback={<ConsultandoServicios />}>
          <EstadoSistema />
        </Suspense>
      </article>
    </main>
  );
}
