import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Boleto } from './boleto';
import { ProveedorBoleto } from './contexto-boleto';

const SELECCION = {
  seleccionId: 's1',
  partidoId: 'p1',
  partido: 'Barcelona SC vs Emelec',
  mercado: 'Resultado final',
  nombre: 'Barcelona SC',
  cuota: '2.10',
};

const APUESTA = {
  id: 'a1',
  tipo: 'SIMPLE',
  monto: '10.00',
  tipoSaldo: 'REAL',
  cuotaTotal: '2.10',
  gananciaPotencial: '21.00',
  estado: 'PENDIENTE',
  premioPagado: '0.00',
  enVivo: false,
  aceptadaEn: '2026-11-15T20:00:00.000Z',
  liquidadaEn: null,
  selecciones: [],
};

function respuesta(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });
}

function montar() {
  window.sessionStorage.setItem('apuestas:boleto', JSON.stringify([SELECCION]));
  return render(
    <ProveedorBoleto>
      <Boleto />
    </ProveedorBoleto>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Boleto', () => {
  it('muestra la estimación informativa y confirma la apuesta con la cuota vista', async () => {
    const fetch = vi.fn().mockResolvedValue(respuesta(201, APUESTA));
    vi.stubGlobal('fetch', fetch);
    montar();

    await userEvent.type(screen.getByLabelText('Monto en dólares'), '10');
    expect(screen.getByText(/21,00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar apuesta' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Apuesta aceptada');
    const cuerpo = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
    expect(cuerpo).toMatchObject({
      monto: '10',
      selecciones: [{ seleccionId: 's1', cuotaVista: '2.10' }],
    });
    // La web no manda ganancia, cuota total ni hora: los calcula la API (FR-041).
    expect(Object.keys(cuerpo).sort()).toEqual(['claveSolicitud', 'monto', 'selecciones']);
  });

  it('si la cuota cambió, actualiza el boleto y pide reconfirmar sin aceptar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respuesta(409, {
          statusCode: 409,
          error: 'Conflict',
          codigo: 'CUOTA_CAMBIADA',
          message: 'La cuota cambió.',
          cuotasVigentes: [{ seleccionId: 's1', cuota: '2.40' }],
        }),
      ),
    );
    montar();

    await userEvent.type(screen.getByLabelText('Monto en dólares'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar apuesta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Las cuotas cambiaron');
    expect(screen.getAllByText('2.40').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Confirmar con las cuotas nuevas' })).toBeEnabled();
  });

  it('muestra el motivo del rechazo que da la API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respuesta(422, {
          statusCode: 422,
          error: 'Unprocessable Entity',
          codigo: 'SALDO_INSUFICIENTE',
          message: 'Saldo insuficiente: tienes 5.00 disponibles.',
          saldoDisponible: '5.00',
        }),
      ),
    );
    montar();

    await userEvent.type(screen.getByLabelText('Monto en dólares'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar apuesta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Saldo insuficiente');
  });

  it('no deja confirmar sin monto válido y permite quitar la selección', async () => {
    vi.stubGlobal('fetch', vi.fn());
    montar();

    expect(screen.getByRole('button', { name: 'Confirmar apuesta' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Barcelona SC del boleto' }));
    expect(screen.getByText(/Elige una cuota/)).toBeInTheDocument();
  });
});
