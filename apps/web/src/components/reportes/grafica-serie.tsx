import { formatearDia, formatearEntero, formatearMonto } from '@/lib/formato';
import { construirGrafica, type ColumnaGrafica, type Grafica } from '@/lib/reportes/grafica';
import type { DiaSerie } from '@/lib/servidor/esquemas-reportes';

interface GraficaSerieProps {
  readonly dias: readonly DiaSerie[];
}

/** Radio del extremo de la columna; la base queda recta sobre la línea del eje. */
const RADIO = 3;

function Columna({ columna, base }: { readonly columna: ColumnaGrafica; readonly base: number }) {
  const { dia } = columna;
  const recto = Math.min(RADIO, columna.alto);
  return (
    <g className="columna-serie">
      <title>{`${columna.etiqueta}: ${formatearMonto(dia.volumen)} apostados en ${formatearEntero(dia.apuestas)} apuestas`}</title>
      {/* Toda la franja del día responde al puntero, no solo la columna. */}
      <rect
        x={`${columna.franjaX}%`}
        width={`${columna.franjaAncho}%`}
        y={0}
        height={base}
        fill="transparent"
      />
      {columna.alto > 0 && (
        <>
          <rect
            className="barra-serie"
            x={`${columna.xPct}%`}
            width={`${columna.anchoPct}%`}
            y={columna.y}
            height={columna.alto}
            rx={RADIO}
            fill="var(--color-serie)"
          />
          <rect
            className="barra-serie"
            x={`${columna.xPct}%`}
            width={`${columna.anchoPct}%`}
            y={base - recto}
            height={recto}
            fill="var(--color-serie)"
          />
        </>
      )}
    </g>
  );
}

/** Rejilla de líneas finas, detrás de las columnas. */
function Rejilla({ grafica }: { readonly grafica: Grafica }) {
  return (
    <>
      {grafica.marcas.map((marca) => (
        <line
          key={marca.y}
          x1="0"
          x2="100%"
          y1={marca.y}
          y2={marca.y}
          stroke="var(--color-perforado)"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
      <line
        x1="0"
        x2="100%"
        y1={grafica.base}
        y2={grafica.base}
        stroke="var(--color-tinta)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
    </>
  );
}

/** Rótulos encima de las columnas, con un halo del color del papel para leerse sobre ellas. */
function Rotulos({ grafica }: { readonly grafica: Grafica }) {
  return (
    <>
      {grafica.marcas.map((marca) => (
        <text
          key={marca.y}
          x="0"
          y={marca.y - 5}
          className="fill-tinta-suave pointer-events-none text-xs"
          stroke="var(--color-papel)"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {marca.texto}
        </text>
      ))}
      {grafica.etiquetasX.map((etiqueta) => (
        <text
          key={etiqueta.texto}
          x={`${etiqueta.xPct}%`}
          y={grafica.base + 18}
          textAnchor={etiqueta.ancla}
          className="fill-tinta-suave pointer-events-none text-xs"
        >
          {etiqueta.texto}
        </text>
      ))}
    </>
  );
}

const CELDA = 'px-3 py-1.5 text-right tabular-nums';
const COLUMNAS_TABLA = ['Apuestas', 'Volumen', 'Premios pagados', 'GGR', 'Depósitos', 'Retiros'];

function valoresDelDia(dia: DiaSerie): readonly string[] {
  return [
    formatearEntero(dia.apuestas),
    formatearMonto(dia.volumen),
    formatearMonto(dia.premiosPagados),
    formatearMonto(dia.ggr),
    formatearMonto(dia.depositos),
    formatearMonto(dia.retiros),
  ];
}

/** Tabla equivalente a la gráfica, con los montos tal como los entrega reportes. */
function TablaSerie({ dias }: GraficaSerieProps) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-semibold underline underline-offset-2">
        Ver la tabla de la serie diaria
      </summary>
      <div role="region" aria-label="Serie diaria" tabIndex={0} className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Serie diaria del periodo</caption>
          <thead className="bg-papel-hondo">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left">
                Día
              </th>
              {COLUMNAS_TABLA.map((columna) => (
                <th key={columna} scope="col" className={CELDA}>
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-perforado divide-y">
            {dias.map((dia) => (
              <tr key={dia.fecha}>
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  {formatearDia(dia.fecha)}
                </th>
                {valoresDelDia(dia).map((valor, indice) => (
                  <td key={COLUMNAS_TABLA[indice]} className={CELDA}>
                    {valor}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Columnas del volumen apostado por día, dibujadas como SVG en el servidor (sin JavaScript en el
 * navegador). Una sola serie: el título la nombra y no hace falta leyenda.
 */
export function GraficaSerie({ dias }: GraficaSerieProps) {
  const grafica = construirGrafica(dias);
  const primero = dias[0];
  const ultimo = dias.at(-1);
  const resumen =
    primero && ultimo
      ? `Columnas del volumen apostado por día, del ${formatearDia(primero.fecha)} al ${formatearDia(ultimo.fecha)}. Los valores están en la tabla de la serie diaria.`
      : 'Sin días en el periodo.';
  return (
    <figure aria-labelledby="titulo-serie" className="mt-10">
      <figcaption id="titulo-serie" className="font-display text-3xl font-bold">
        Volumen apostado por día
      </figcaption>
      <div className="mt-3" style={{ maxWidth: grafica.anchoMaximo }}>
        <svg
          role="img"
          aria-label={resumen}
          width="100%"
          height={grafica.altoTotal}
          className="block overflow-visible"
        >
          <Rejilla grafica={grafica} />
          {grafica.columnas.map((columna) => (
            <Columna key={columna.dia.fecha} columna={columna} base={grafica.base} />
          ))}
          <Rotulos grafica={grafica} />
        </svg>
      </div>
      <TablaSerie dias={dias} />
    </figure>
  );
}
