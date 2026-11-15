import type { VistaAlerta } from '@apuestas/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EstadoAccion } from '@/lib/acciones';
import { ALERTA } from '@/test/fixtures';
import { DetalleAlerta } from './detalle-alerta';
import { FiltrosAlertas } from './filtros-alertas';
import { ListaAlertas } from './lista-alertas';
import { PanelResolucion, type AccionResolver } from './panel-resolucion';

const RESUELTA: VistaAlerta = {
  ...ALERTA,
  estado: 'DESCARTADA',
  nota: 'Familia en la misma casa',
  resueltaPor: 'admin-1',
  resueltaEn: '2026-12-04T15:00:00.000Z',
};

describe('ListaAlertas', () => {
  it('muestra severidad, regla, usuario y estado de cada alerta', () => {
    render(
      <ListaAlertas
        alertas={[ALERTA, { ...RESUELTA, id: 'a2', severidad: 'MEDIA' }]}
        hayFiltros={false}
      />,
    );

    const filas = within(screen.getByRole('list', { name: 'Alertas' })).getAllByRole('listitem');
    expect(filas[0]).toHaveTextContent('Severidad Alta');
    expect(
      within(filas[0]!).getByRole('link', { name: 'Cuentas múltiples por dispositivo' }),
    ).toHaveAttribute('href', `/admin/alertas/${ALERTA.id}`);
    expect(filas[0]).toHaveTextContent('usuario-ana');
    expect(filas[0]).toHaveTextContent('Abierta');
    expect(filas[1]).toHaveTextContent('Severidad Media');
    expect(filas[1]).toHaveTextContent('Descartada');
  });

  it('distingue la lista vacía con y sin filtros', () => {
    const { rerender } = render(<ListaAlertas alertas={[]} hayFiltros />);
    expect(screen.getByRole('link', { name: 'Quitar filtros' })).toBeInTheDocument();

    rerender(<ListaAlertas alertas={[]} hayFiltros={false} />);
    expect(screen.getByText('No hay alertas de fraude.')).toBeInTheDocument();
  });
});

describe('FiltrosAlertas', () => {
  it('conserva los filtros de la URL', () => {
    render(
      <FiltrosAlertas
        filtros={{ estado: 'ABIERTA', regla: 'CUENTAS_IP', desde: '2026-12-01', pagina: 1 }}
      />,
    );

    expect(screen.getByLabelText('Estado')).toHaveValue('ABIERTA');
    expect(screen.getByLabelText('Regla')).toHaveValue('CUENTAS_IP');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-12-01');
    expect(screen.getByRole('button', { name: 'Filtrar alertas' })).toBeInTheDocument();
  });
});

describe('DetalleAlerta', () => {
  it('muestra la severidad y la evidencia legible', () => {
    render(<DetalleAlerta alerta={ALERTA} />);

    expect(screen.getByText('Severidad alta')).toBeInTheDocument();
    const evidencia = screen.getByRole('region', { name: 'Evidencia' });
    expect(within(evidencia).getByText('Dispositivo')).toBeInTheDocument();
    expect(within(evidencia).getByText('disp-7f3a')).toBeInTheDocument();
    expect(within(evidencia).getByRole('list')).toHaveTextContent('usuario-beto');
  });
});

describe('PanelResolucion', () => {
  it('envía la decisión del botón y la nota, y anuncia el resultado', async () => {
    const usuario = userEvent.setup();
    const accion = vi.fn<AccionResolver>(async (previo: EstadoAccion, formData: FormData) => ({
      resultado: 'exito',
      mensaje: `Decisión ${String(formData.get('estado'))}: ${String(formData.get('nota'))}`,
      intento: previo.intento + 1,
    }));
    render(<PanelResolucion alerta={ALERTA} accion={accion} />);

    await usuario.type(screen.getByLabelText('Nota de la resolución'), 'Mismo titular');
    expect(screen.getByText(/Llevas 13\./)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Confirmar fraude' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Decisión CONFIRMADA: Mismo titular'),
    );
  });

  it('muestra la resolución en lugar del formulario cuando la alerta ya no está abierta', () => {
    render(<PanelResolucion alerta={RESUELTA} accion={vi.fn<AccionResolver>()} />);

    expect(screen.queryByRole('button', { name: 'Confirmar fraude' })).not.toBeInTheDocument();
    const resolucion = screen.getByRole('region', { name: 'Resolución' });
    expect(resolucion).toHaveTextContent('Descartada');
    expect(resolucion).toHaveTextContent('admin-1');
    expect(resolucion).toHaveTextContent('Familia en la misma casa');
  });
});
