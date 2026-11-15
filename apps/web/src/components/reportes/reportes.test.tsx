import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COMPETICIONES, RESUMEN, RESUMEN_VACIO, SERIE } from '@/test/fixtures-reportes';
import { Competiciones } from './competiciones';
import { FiltrosReporte } from './filtros-reporte';
import { GraficaSerie } from './grafica-serie';
import { Metricas } from './metricas';
import { ErroresFiltros, Tablero } from './tablero';

const FILTROS = { desde: '2026-12-02', hasta: '2026-12-31' };
const HOY = '2026-12-31';

describe('Metricas', () => {
  it('encabeza con el volumen apostado y agrupa el resto', () => {
    render(<Metricas resumen={RESUMEN} />);

    const metricas = screen.getByRole('region', { name: 'Métricas del periodo' });
    expect(within(metricas).getByText('$15.200,00')).toHaveClass('text-5xl');
    expect(metricas).toHaveTextContent('1.520 apuestas de 87 usuarios activos');
    expect(metricas).toHaveTextContent('$1.850,00');
    expect(metricas).toHaveTextContent('$13.100,00');
    const cupones = screen.getByRole('region', { name: 'Cupones' });
    expect(cupones).toHaveTextContent('60');
    expect(cupones).toHaveTextContent('$540,00');
    expect(screen.getByRole('region', { name: 'Alertas de fraude' })).toHaveTextContent('6 y 5');
  });

  it('explica un GGR negativo con palabras', () => {
    render(<Metricas resumen={{ ...RESUMEN, apuestas: { ...RESUMEN.apuestas, ggr: '-49.50' } }} />);

    expect(screen.getByText(/Negativo: los premios superaron lo apostado/)).toBeInTheDocument();
  });
});

describe('GraficaSerie', () => {
  it('dibuja una columna por día con su valor en el título y una tabla equivalente', () => {
    const { container } = render(<GraficaSerie dias={SERIE.dias} />);

    expect(
      screen.getByRole('img', {
        name: /Columnas del volumen apostado por día, del 1 dic al 3 dic/,
      }),
    ).toBeInTheDocument();
    const titulos = [...container.querySelectorAll('svg g.columna-serie title')].map(
      (t) => t.textContent,
    );
    expect(titulos).toEqual([
      '1 dic: $500,00 apostados en 48 apuestas',
      '2 dic: $0,00 apostados en 0 apuestas',
      '3 dic: $1.250,50 apostados en 120 apuestas',
    ]);
    expect(container.querySelectorAll('rect.barra-serie')).toHaveLength(4);

    const tabla = within(container.querySelector('details')!).getByRole('table', { hidden: true });
    expect(within(tabla).getAllByRole('row', { hidden: true })).toHaveLength(4);
    expect(tabla).toHaveTextContent('-49,50');
  });
});

describe('Competiciones', () => {
  it('lista el desglose y filtra por competición conservando los demás filtros', () => {
    render(
      <Competiciones
        competiciones={COMPETICIONES.competiciones}
        filtros={{ ...FILTROS, deporte: 'futbol' }}
      />,
    );

    const filas = within(screen.getByRole('list', { name: 'Competiciones' })).getAllByRole(
      'listitem',
    );
    expect(filas[0]).toHaveTextContent('LigaPro');
    expect(filas[0]).toHaveTextContent('$3.000,00');
    expect(filas[1]).toHaveTextContent('=Copa "Libertadores"');
    expect(
      within(filas[0]!).getByRole('link', { name: 'Ver solo esta competición' }),
    ).toHaveAttribute(
      'href',
      `/admin/reportes?desde=2026-12-02&hasta=2026-12-31&deporte=futbol&competicionId=${COMPETICIONES.competiciones[0]!.competicionId}`,
    );
  });

  it('dice que no hubo apuestas por competición', () => {
    render(<Competiciones competiciones={[]} filtros={FILTROS} />);

    expect(
      screen.getByText('Ninguna competición tuvo apuestas en este periodo.'),
    ).toBeInTheDocument();
  });
});

describe('FiltrosReporte', () => {
  it('marca el atajo de rango vigente y muestra la competición filtrada', () => {
    const competicionId = COMPETICIONES.competiciones[0]!.competicionId;
    render(
      <FiltrosReporte
        filtros={{ ...FILTROS, competicionId }}
        hoy={HOY}
        nombreCompeticion="LigaPro"
      />,
    );

    expect(screen.getByRole('link', { name: 'Últimos 30 días' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Últimos 7 días' })).toHaveAttribute(
      'href',
      `/admin/reportes?desde=2026-12-25&hasta=2026-12-31&competicionId=${competicionId}`,
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-12-02');
    expect(screen.getByText('LigaPro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quitar la competición' })).toHaveAttribute(
      'href',
      '/admin/reportes?desde=2026-12-02&hasta=2026-12-31',
    );
  });
});

describe('Tablero', () => {
  it('dice "sin datos en este periodo" y muestra los ceros', () => {
    render(
      <Tablero
        tablero={{
          resumen: RESUMEN_VACIO,
          serie: { dias: [] },
          competiciones: { competiciones: [] },
        }}
        filtros={FILTROS}
        hoy={HOY}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Sin datos en este periodo.');
    expect(screen.getAllByText('$0,00').length).toBeGreaterThan(0);
  });

  it('no muestra el aviso de vacío con datos', () => {
    render(
      <Tablero
        tablero={{ resumen: RESUMEN, serie: SERIE, competiciones: COMPETICIONES }}
        filtros={FILTROS}
        hoy={HOY}
      />,
    );

    expect(screen.queryByText('Sin datos en este periodo.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desglose por competición' })).toBeInTheDocument();
  });

  it('lista los errores de los filtros', () => {
    render(
      <ErroresFiltros errores={['La fecha de inicio no es válida: usa el formato AAAA-MM-DD.']} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('La fecha de inicio no es válida');
  });
});
