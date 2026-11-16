import { describe, expect, it } from 'vitest';
import { estimar, montoValido, reducirBoleto, type SeleccionBoleto } from './boleto';

const sel = (seleccionId: string, partidoId: string, cuota: string): SeleccionBoleto => ({
  seleccionId,
  partidoId,
  partido: 'A vs B',
  mercado: 'Resultado final',
  nombre: 'A',
  cuota,
});

describe('reducirBoleto', () => {
  it('agrega una selección y la quita si se vuelve a elegir', () => {
    const una = reducirBoleto([], { tipo: 'alternar', seleccion: sel('s1', 'p1', '2.10') });
    expect(una.map((s) => s.seleccionId)).toEqual(['s1']);
    expect(reducirBoleto(una, { tipo: 'alternar', seleccion: sel('s1', 'p1', '2.10') })).toEqual(
      [],
    );
  });

  it('una segunda selección del mismo partido reemplaza a la primera (no se combinan)', () => {
    const boleto = reducirBoleto([sel('s1', 'p1', '2.10')], {
      tipo: 'alternar',
      seleccion: sel('s2', 'p1', '3.20'),
    });
    expect(boleto.map((s) => s.seleccionId)).toEqual(['s2']);
  });

  it('selecciones de partidos distintos forman una combinada', () => {
    const boleto = reducirBoleto([sel('s1', 'p1', '2.10')], {
      tipo: 'alternar',
      seleccion: sel('s2', 'p2', '1.50'),
    });
    expect(boleto).toHaveLength(2);
  });

  it('actualiza las cuotas con las vigentes que devolvió la API', () => {
    const boleto = reducirBoleto([sel('s1', 'p1', '2.10'), sel('s2', 'p2', '1.50')], {
      tipo: 'actualizar-cuotas',
      cuotas: new Map([['s2', '1.65']]),
    });
    expect(boleto.map((s) => s.cuota)).toEqual(['2.10', '1.65']);
  });

  it('quita una selección y vacía el boleto', () => {
    const boleto = [sel('s1', 'p1', '2.10'), sel('s2', 'p2', '1.50')];
    expect(reducirBoleto(boleto, { tipo: 'quitar', seleccionId: 's1' })).toHaveLength(1);
    expect(reducirBoleto(boleto, { tipo: 'vaciar' })).toEqual([]);
  });
});

describe('montoValido', () => {
  it.each(['10', '10.5', '0.50', '500.00'])('acepta %s', (monto) => {
    expect(montoValido(monto)).toBe(true);
  });

  it.each(['', '0', '0.00', '-1', '10.505', 'diez', '1e3'])('rechaza %j', (monto) => {
    expect(montoValido(monto)).toBe(false);
  });
});

describe('estimar (solo informativo, igual que la API)', () => {
  it('una simple: la cuota tal cual y monto × cuota', () => {
    expect(estimar([sel('s1', 'p1', '2.10')], '10.00')).toEqual({
      cuotaTotal: '2.10',
      ganancia: '21.00',
    });
  });

  it('una combinada redondea el producto una sola vez al final', () => {
    // 1.85 × 2.10 × 1.55 = 6.02175 → 6.02; 10 × 6.02 = 60.20
    const boleto = [sel('a', 'p1', '1.85'), sel('b', 'p2', '2.10'), sel('c', 'p3', '1.55')];
    expect(estimar(boleto, '10')).toEqual({ cuotaTotal: '6.02', ganancia: '60.20' });
  });

  it('redondea la ganancia mitad hacia arriba', () => {
    expect(estimar([sel('s', 'p', '1.85')], '3.33')).toEqual({
      cuotaTotal: '1.85',
      ganancia: '6.16',
    });
  });

  it('sin monto válido muestra la cuota pero no la ganancia; sin selecciones, nada', () => {
    expect(estimar([sel('s', 'p', '2.00')], '')).toEqual({ cuotaTotal: '2.00', ganancia: '' });
    expect(estimar([], '10')).toBeNull();
  });
});
