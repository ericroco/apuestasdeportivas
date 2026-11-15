import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ACCION_INICIAL, type EstadoAccion } from '@/lib/acciones';
import { FORMULARIO_INICIAL, type EstadoFormularioCupon } from '@/lib/cupones/formulario';
import { CUPON, CUPON_CUOTA, DETALLE_CUPON } from '@/test/fixtures';
import { AccionesCupon, type AccionCupon } from './acciones-cupon';
import { DetalleCupon } from './detalle-cupon';
import { FiltrosCupones } from './filtros-cupones';
import { FormularioCupon } from './formulario-cupon';
import { ListaCupones } from './lista-cupones';

describe('ListaCupones', () => {
  it('muestra cada cupón con su valor, sus canjes y su estado', () => {
    render(<ListaCupones cupones={[CUPON, CUPON_CUOTA]} hayFiltros={false} />);

    const filas = within(screen.getByRole('list', { name: 'Cupones' })).getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(within(filas[0]!).getByRole('link', { name: 'BIENVENIDA10' })).toHaveAttribute(
      'href',
      `/operador/cupones/${CUPON.id}`,
    );
    expect(filas[0]).toHaveTextContent('100 % del depósito, hasta $10,00');
    expect(filas[0]).toHaveTextContent('40 de 500');
    expect(filas[0]).toHaveTextContent('Activo');
    expect(filas[1]).toHaveTextContent('Pausado');
  });

  it('invita a quitar los filtros cuando ningún cupón los cumple', () => {
    render(<ListaCupones cupones={[]} hayFiltros />);

    expect(screen.getByText('Ningún cupón cumple estos filtros.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quitar filtros' })).toHaveAttribute(
      'href',
      '/operador/cupones',
    );
  });

  it('invita a crear el primero cuando no hay cupones', () => {
    render(<ListaCupones cupones={[]} hayFiltros={false} />);

    expect(screen.getByRole('link', { name: 'Crear el primer cupón' })).toBeInTheDocument();
  });
});

describe('FiltrosCupones', () => {
  it('es un formulario GET con los filtros actuales', () => {
    render(<FiltrosCupones filtros={{ estado: 'PAUSADO', busqueda: 'BIEN', pagina: 1 }} />);

    const formulario = screen.getByRole('form', { name: 'Filtrar cupones' });
    expect(formulario).toHaveAttribute('method', 'get');
    expect(screen.getByLabelText('Código')).toHaveValue('BIEN');
    expect(screen.getByLabelText('Estado')).toHaveValue('PAUSADO');
    expect(screen.getByRole('button', { name: 'Filtrar cupones' })).toBeInTheDocument();
  });
});

describe('DetalleCupon', () => {
  it('muestra lo que otorga, las condiciones y el resumen de canjes', () => {
    render(<DetalleCupon cupon={DETALLE_CUPON} />);

    expect(screen.getByText('100 % del depósito, hasta $10,00')).toBeInTheDocument();
    expect(screen.getByText('Depósito mínimo $10,00')).toBeInTheDocument();
    expect(screen.getByText('40 de un cupo de 500')).toBeInTheDocument();
    expect(screen.getByText('$400,00')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('FormularioCupon', () => {
  it('muestra solo los campos del tipo elegido', async () => {
    const usuario = userEvent.setup();
    render(<FormularioCupon accion={vi.fn()} />);

    expect(
      screen.getByText('Elige un tipo para ver su valor y sus condiciones.'),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole('radio', { name: /Apuesta gratis/ }));
    expect(screen.getByLabelText('Monto de la apuesta gratis (USD)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Porcentaje del depósito')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('radio', { name: /Bono de depósito/ }));
    expect(screen.getByLabelText('Porcentaje del depósito')).toBeInTheDocument();
    expect(screen.getByLabelText('Tope del bono (USD)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Monto de la apuesta gratis (USD)')).not.toBeInTheDocument();
  });

  it('envía el formulario y marca los campos que la acción devuelve con error', async () => {
    const usuario = userEvent.setup();
    const accion = vi.fn(
      async (
        previo: EstadoFormularioCupon,
        formData: FormData,
      ): Promise<EstadoFormularioCupon> => ({
        intento: previo.intento + 1,
        mensaje: null,
        valores: { codigo: String(formData.get('codigo')), tipo: 'APUESTA_GRATIS' },
        errores: { montoFijo: 'Escribe el monto de la apuesta gratis, mayor que 0 (p. ej. 5.00).' },
      }),
    );
    render(<FormularioCupon accion={accion} />);

    await usuario.type(screen.getByLabelText('Código'), 'gratis5');
    await usuario.click(screen.getByRole('radio', { name: /Apuesta gratis/ }));
    await usuario.click(screen.getByRole('button', { name: 'Crear cupón' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Revisa el campo: monto de la apuesta gratis.',
      ),
    );
    const enviado = accion.mock.calls[0]?.[1];
    expect(enviado?.get('tipo')).toBe('APUESTA_GRATIS');
    expect(enviado?.has('porcentaje')).toBe(false);
    expect(screen.getByLabelText('Monto de la apuesta gratis (USD)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Código')).toHaveValue('gratis5');
  });

  it('muestra el mensaje general cuando la API rechaza', async () => {
    const usuario = userEvent.setup();
    const accion = vi.fn(async (previo: EstadoFormularioCupon): Promise<EstadoFormularioCupon> => ({
      ...FORMULARIO_INICIAL,
      intento: previo.intento + 1,
      mensaje: 'Ya existe un cupón con ese código.',
    }));
    render(<FormularioCupon accion={accion} />);

    await usuario.click(screen.getByRole('button', { name: 'Crear cupón' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Ya existe un cupón con ese código.'),
    );
  });
});

describe('AccionesCupon', () => {
  function acciones(cambiarEstado: AccionCupon = vi.fn(async () => ACCION_INICIAL)) {
    return {
      cambiarEstado,
      extenderVigencia: vi.fn<AccionCupon>(),
      ampliarCupo: vi.fn<AccionCupon>(),
    };
  }

  it('pausa un cupón activo y anuncia el resultado', async () => {
    const usuario = userEvent.setup();
    const cambiarEstado = vi.fn(
      async (previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> => ({
        resultado: 'exito',
        mensaje: `Cupón ${formData.get('estado') === 'PAUSADO' ? 'pausado' : '?'}.`,
        intento: previo.intento + 1,
      }),
    );
    render(<AccionesCupon cupon={CUPON} {...acciones(cambiarEstado)} />);

    await usuario.click(screen.getByRole('button', { name: 'Pausar cupón' }));

    const formulario = screen.getByRole('form', { name: 'Pausar' });
    await waitFor(() =>
      expect(within(formulario).getByRole('status')).toHaveTextContent('Cupón pausado.'),
    );
  });

  it('ofrece reactivar un cupón pausado y exige un cupo mayor al actual', () => {
    render(<AccionesCupon cupon={CUPON_CUOTA} {...acciones()} />);

    expect(screen.getByRole('button', { name: 'Reactivar cupón' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nuevo cupo total')).toHaveAttribute('min', '501');
    expect(screen.getByLabelText('Nuevo fin (hora de Ecuador)')).toHaveValue('2027-01-31T23:59');
  });
});
