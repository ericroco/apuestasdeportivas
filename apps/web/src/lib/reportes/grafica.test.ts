import { describe, expect, it } from 'vitest';
import { SERIE } from '@/test/fixtures-reportes';
import { construirGrafica, maximoRedondo, textoEje } from './grafica';

function dias(cantidad: number, volumen = '10.00') {
  return Array.from({ length: cantidad }, (_, indice) => ({
    ...SERIE.dias[0]!,
    fecha: `2026-12-${String(indice + 1).padStart(2, '0')}`,
    volumen,
  }));
}

describe('maximoRedondo', () => {
  it.each([
    [0, 1],
    [0.4, 0.5],
    [7, 10],
    [1250.5, 2000],
    [2400, 2500],
    [41000, 50000],
  ])('redondea %d hacia arriba a %d', (valor, esperado) => {
    expect(maximoRedondo(valor)).toBe(esperado);
  });
});

describe('textoEje', () => {
  it('escribe completo bajo 10 000 y compacto desde ahí', () => {
    expect(textoEje(0)).toBe('$0');
    expect(textoEje(2500)).toBe('$2.500');
    // Intl separa la unidad con un espacio de no separación.
    expect(textoEje(25000)).toBe('$25 k');
    expect(textoEje(1500000)).toBe('$1,5 M');
  });
});

describe('construirGrafica', () => {
  it('escala las columnas al máximo redondo y las apoya en la línea base', () => {
    const grafica = construirGrafica(SERIE.dias);

    expect(grafica.marcas.map((marca) => marca.texto)).toEqual(['$0', '$1.000', '$2.000']);
    const [primera, vacia, tercera] = grafica.columnas;
    expect(primera?.alto).toBeCloseTo((500 / 2000) * grafica.altoPlot);
    expect(primera!.y + primera!.alto).toBe(grafica.base);
    expect(vacia?.alto).toBe(0);
    expect(tercera?.alto).toBeCloseTo((1250.5 / 2000) * grafica.altoPlot);
  });

  it('reparte el ancho en franjas iguales con la columna centrada y aire alrededor', () => {
    const grafica = construirGrafica(dias(31));

    const columna = grafica.columnas[1]!;
    expect(columna.franjaX).toBeCloseTo(100 / 31);
    expect(columna.anchoPct).toBeCloseTo((100 / 31) * 0.6);
    expect(columna.xPct + columna.anchoPct / 2).toBeCloseTo(columna.franjaX + 100 / 31 / 2);
  });

  it('limita el ancho para que con pocos días ninguna columna pase de 24 px', () => {
    const pocas = construirGrafica(SERIE.dias);

    expect(construirGrafica(dias(31)).anchoMaximo).toBe(31 * 40);
    expect(pocas.anchoMaximo).toBe(200);
    expect((pocas.columnas[0]!.anchoPct / 100) * pocas.anchoMaximo).toBeLessThanOrEqual(24);
  });

  it('rotula todos los días si son pocos y solo algunos si son muchos, siempre el primero y el último', () => {
    expect(construirGrafica(dias(5)).etiquetasX).toHaveLength(5);

    const muchas = construirGrafica(dias(31)).etiquetasX;
    expect(muchas.length).toBeLessThanOrEqual(8);
    expect(muchas[0]).toEqual(expect.objectContaining({ texto: '1 dic', ancla: 'start' }));
    expect(muchas.at(-1)).toEqual(expect.objectContaining({ texto: '31 dic', ancla: 'end' }));
  });

  it('no dibuja columnas en un periodo sin apuestas', () => {
    const grafica = construirGrafica(dias(3, '0.00'));

    expect(grafica.columnas.every((columna) => columna.alto === 0)).toBe(true);
    expect(grafica.marcas.at(-1)?.texto).toBe('$1');
  });
});
