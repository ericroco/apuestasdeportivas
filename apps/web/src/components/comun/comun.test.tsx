import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EstadoAcceso } from './estado-acceso';
import { Hoja } from './hoja';
import { MensajeAccion } from './mensaje-accion';
import { Paginacion } from './paginacion';

function estado(fallo: Parameters<typeof EstadoAcceso>[0]['fallo']) {
  render(
    <EstadoAcceso
      fallo={fallo}
      rol="operador o administrador"
      que="los cupones"
      reintentarHref="/operador/cupones?estado=ACTIVO"
    />,
  );
}

describe('EstadoAcceso', () => {
  it('pide iniciar sesión sin ofrecer reintentar', () => {
    estado({ tipo: 'sin-sesion' });

    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(
      screen.getByText(/necesitas una sesión de operador o administrador/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('explica la falta de permiso', () => {
    estado({ tipo: 'sin-permiso' });

    expect(
      screen.getByRole('heading', { name: 'No tienes permiso para ver esta sección' }),
    ).toBeInTheDocument();
  });

  it('ofrece reintentar con los mismos filtros cuando el servicio no está disponible', () => {
    estado({ tipo: 'no-disponible' });

    expect(
      screen.getByRole('heading', { name: 'El servicio no está disponible, reintenta' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute(
      'href',
      '/operador/cupones?estado=ACTIVO',
    );
  });

  it('distingue los datos de reportes que aún no existen', () => {
    estado({ tipo: 'no-disponible', codigo: 'DATOS_NO_DISPONIBLES' });

    expect(screen.getByText(/todavía no tiene los datos/)).toBeInTheDocument();
  });

  it('muestra el mensaje de un rechazo', () => {
    estado({ tipo: 'rechazo', estado: 400, codigo: 'X', mensaje: 'El rango es muy largo.' });

    expect(
      screen.getByRole('heading', { name: 'No se pudo cargar los cupones' }),
    ).toBeInTheDocument();
    expect(screen.getByText('El rango es muy largo.')).toBeInTheDocument();
  });
});

describe('Paginacion', () => {
  const href = (pagina: number) => `/x?pagina=${pagina}`;

  it('enlaza la página anterior y la siguiente', () => {
    render(
      <Paginacion pagina={2} tamano={20} total={45} hrefDePagina={href} elementos="cupones" />,
    );

    expect(screen.getByText('45 cupones. Página 2 de 3.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Página anterior' })).toHaveAttribute(
      'href',
      '/x?pagina=1',
    );
    expect(screen.getByRole('link', { name: 'Página siguiente' })).toHaveAttribute(
      'href',
      '/x?pagina=3',
    );
  });

  it('no enlaza fuera del rango', () => {
    render(<Paginacion pagina={1} tamano={20} total={0} hrefDePagina={href} elementos="alertas" />);

    expect(screen.getByText('0 alertas. Página 1 de 1.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('Hoja y MensajeAccion', () => {
  it('nombra la hoja con su título y la ruta de migas', () => {
    render(
      <Hoja
        seccion="Operador"
        titulo="Crear cupón"
        migas={[{ texto: 'Cupones', href: '/operador/cupones' }]}
      >
        <p>contenido</p>
      </Hoja>,
    );

    expect(screen.getByRole('article', { name: 'Crear cupón' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toHaveTextContent('Cupones');
  });

  it('anuncia los errores en otro tono que los éxitos', () => {
    render(<MensajeAccion estado={{ resultado: 'error', mensaje: 'No se pudo.', intento: 1 }} />);

    expect(screen.getByRole('status')).toHaveTextContent('No se pudo.');
    expect(screen.getByRole('status')).toHaveClass('text-falla');
  });
});
