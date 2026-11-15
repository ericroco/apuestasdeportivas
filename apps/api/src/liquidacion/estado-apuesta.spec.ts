import type { ResultadoSeleccion } from '@apuestas/shared';
import { Decimal } from '../comun/decimal.js';
import { calcularLiquidacion } from './estado-apuesta.js';

const s = (resultado: ResultadoSeleccion, cuota: string) => ({
  resultado,
  cuotaCongelada: new Decimal(cuota),
});
const monto = new Decimal('10.00');

describe('calcularLiquidacion (FR-026, FR-035)', () => {
  it('una simple ganadora cobra monto × cuota congelada', () => {
    expect(calcularLiquidacion(monto, [s('GANADORA', '2.15')])).toEqual({
      estado: 'GANADA',
      cuotaEfectiva: new Decimal('2.15'),
      montoAPagar: new Decimal('21.50'),
    });
  });

  it('una simple perdedora no mueve dinero', () => {
    expect(calcularLiquidacion(monto, [s('PERDEDORA', '2.15')])).toMatchObject({
      estado: 'PERDIDA',
      montoAPagar: new Decimal(0),
    });
  });

  it('una simple anulada se reembolsa por el monto apostado', () => {
    expect(calcularLiquidacion(monto, [s('ANULADA', '2.15')])).toMatchObject({
      estado: 'ANULADA',
      montoAPagar: new Decimal('10.00'),
    });
  });

  it('una combinada sigue pendiente mientras falte resolver alguna selección', () => {
    const resultado = calcularLiquidacion(monto, [s('GANADORA', '2.00'), s('PENDIENTE', '1.50')]);
    expect(resultado.estado).toBe('PENDIENTE');
  });

  it('una combinada pierde en cuanto pierde una, aunque falten partidos', () => {
    const resultado = calcularLiquidacion(monto, [s('PENDIENTE', '2.00'), s('PERDEDORA', '1.50')]);
    expect(resultado).toMatchObject({ estado: 'PERDIDA', montoAPagar: new Decimal(0) });
  });

  it('una combinada ganadora cobra con la cuota total redondeada una sola vez', () => {
    // 1.85 × 2.10 × 1.55 = 6.02175 → 6.02; premio 60.20
    const resultado = calcularLiquidacion(monto, [
      s('GANADORA', '1.85'),
      s('GANADORA', '2.10'),
      s('GANADORA', '1.55'),
    ]);
    expect(resultado).toEqual({
      estado: 'GANADA',
      cuotaEfectiva: new Decimal('6.02'),
      montoAPagar: new Decimal('60.20'),
    });
  });

  it('en una combinada la selección anulada cuenta con cuota 1.00', () => {
    const resultado = calcularLiquidacion(monto, [s('GANADORA', '2.00'), s('ANULADA', '3.00')]);
    expect(resultado).toEqual({
      estado: 'GANADA',
      cuotaEfectiva: new Decimal('2.00'),
      montoAPagar: new Decimal('20.00'),
    });
  });

  it('una combinada con todas sus selecciones anuladas se reembolsa completa', () => {
    const resultado = calcularLiquidacion(monto, [s('ANULADA', '2.00'), s('ANULADA', '3.00')]);
    expect(resultado).toMatchObject({ estado: 'ANULADA', montoAPagar: new Decimal('10.00') });
  });
});
