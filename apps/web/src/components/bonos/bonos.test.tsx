import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MIS_BONOS } from '@/test/fixtures';
import { BarraAvance } from './barra-avance';
import { MisBonos } from './mis-bonos';

describe('BarraAvance', () => {
  it('expone el avance con role="progressbar", sus valores y un texto legible', () => {
    render(<BarraAvance porcentaje={25} avance="12.50" requisito="50.00" />);

    const barra = screen.getByRole('progressbar', { name: 'Avance del rollover' });
    expect(barra).toHaveAttribute('aria-valuemin', '0');
    expect(barra).toHaveAttribute('aria-valuemax', '100');
    expect(barra).toHaveAttribute('aria-valuenow', '25');
    expect(barra).toHaveAttribute('aria-valuetext', '$12,50 de $50,00 apostados (25 %)');
  });

  it('no desborda si la API reporta más del 100 %', () => {
    render(<BarraAvance porcentaje={130} avance="65.00" requisito="50.00" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('MisBonos', () => {
  it('muestra el bono activo con su monto, su avance y su vencimiento', () => {
    render(<MisBonos bonos={MIS_BONOS} />);

    const activo = screen.getByRole('region', { name: 'Bono activo' });
    expect(activo).toHaveTextContent('BIENVENIDA10');
    expect(activo).toHaveTextContent('$10,00');
    expect(activo).toHaveTextContent('Has apostado $12,50 de los $50,00 que pide el rollover.');
    expect(activo).toHaveTextContent(/Vence el 1 ene 2027/);
    expect(activo).toHaveTextContent('cuota total de 1,50 o más');
    expect(within(activo).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('lista el historial con lo que pasó a saldo real', () => {
    render(<MisBonos bonos={MIS_BONOS} />);

    const historial = screen.getByRole('list', { name: 'Bonos anteriores' });
    const fila = within(historial).getByRole('listitem');
    expect(fila).toHaveTextContent('GRATIS5');
    expect(fila).toHaveTextContent('Cumplido');
    expect(fila).toHaveTextContent('$7,40 pasaron a tu saldo real');
  });

  it('muestra los canjes rechazados con su motivo', () => {
    render(<MisBonos bonos={MIS_BONOS} />);

    const rechazados = screen.getByRole('list', { name: 'Canjes rechazados' });
    expect(rechazados).toHaveTextContent('DOBLE20');
    expect(rechazados).toHaveTextContent(
      'Ya tienes un bono activo; termina su rollover antes de usar otro.',
    );
  });

  it('explica cómo conseguir un bono cuando no hay ninguno', () => {
    render(
      <MisBonos
        bonos={{ activo: null, historial: [], canjesRechazados: [], cuotaMinima: '1.50' }}
      />,
    );

    expect(screen.getByText('No tienes un bono activo.')).toBeInTheDocument();
    expect(screen.getByText(/Escribe el código de un cupón al depositar/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Todavía no tienes bonos cumplidos ni vencidos.')).toBeInTheDocument();
    expect(screen.getByText('Ningún cupón tuyo fue rechazado.')).toBeInTheDocument();
  });

  it('marca un bono vencido sin conversión', () => {
    const vencido = {
      ...MIS_BONOS.historial[0]!,
      estado: 'VENCIDO' as const,
      montoConvertido: null,
      cumplidoEn: null,
    };
    render(<MisBonos bonos={{ ...MIS_BONOS, historial: [vencido] }} />);

    const fila = within(screen.getByRole('list', { name: 'Bonos anteriores' })).getByRole(
      'listitem',
    );
    expect(fila).toHaveTextContent('Vencido');
    expect(fila).toHaveTextContent('Venció sin cumplir el rollover');
  });
});
