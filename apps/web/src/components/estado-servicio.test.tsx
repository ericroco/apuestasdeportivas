import type { RespuestaSalud } from '@apuestas/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resumirSalud } from '@/lib/salud';
import { EstadoServicio } from './estado-servicio';

const SALUD_OK: RespuestaSalud = {
  estado: 'ok',
  servicio: 'api',
  version: '0.1.0',
  fecha: '2026-11-14T18:00:00.000Z',
  dependencias: {
    baseDeDatos: { estado: 'ok', latenciaMs: 3 },
    cache: { estado: 'ok', latenciaMs: 1 },
  },
};

function renderizar(salud: RespuestaSalud | null): HTMLElement {
  render(
    <ul>
      <EstadoServicio
        nombre="API"
        funcion="Saldos, apuestas y liquidación"
        resumen={resumirSalud(salud)}
      />
    </ul>,
  );
  return screen.getByRole('listitem', { name: 'API' });
}

describe('EstadoServicio', () => {
  it('muestra "Operativo", la versión y la latencia de cada dependencia', () => {
    const fila = renderizar(SALUD_OK);

    expect(within(fila).getByText('Operativo')).toBeInTheDocument();
    expect(within(fila).getByText('v0.1.0')).toBeInTheDocument();
    expect(within(fila).getByText('Base de datos')).toBeInTheDocument();
    expect(within(fila).getByText('3 ms')).toBeInTheDocument();
    expect(within(fila).getByText('Caché')).toBeInTheDocument();
  });

  it('muestra "No disponible" y marca la dependencia que falla', () => {
    const fila = renderizar({
      ...SALUD_OK,
      estado: 'error',
      dependencias: {
        baseDeDatos: { estado: 'ok', latenciaMs: 3 },
        cache: { estado: 'error', latenciaMs: 2000 },
      },
    });

    expect(within(fila).getByText('No disponible')).toBeInTheDocument();
    expect(within(fila).getByText('Sin respuesta')).toBeInTheDocument();
  });

  it('muestra "No responde" cuando el servicio no contestó', () => {
    const fila = renderizar(null);

    expect(within(fila).getByText('No responde')).toBeInTheDocument();
    expect(within(fila).queryByRole('definition')).not.toBeInTheDocument();
  });
});
