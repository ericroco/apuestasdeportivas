import { Decimal } from '../comun/decimal.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import {
  calcularCuotaTotal,
  calcularGanancia,
  inicioDelDiaLocal,
  type Limites,
  validarCombinada,
  validarLimites,
} from './calculo.js';

const d = (valor: string) => new Decimal(valor);

const LIMITES: Limites = {
  montoMin: d('0.50'),
  montoMax: d('500.00'),
  diario: d('1000.00'),
  gananciaMax: d('5000.00'),
};

function capturar(funcion: () => void): ErrorNegocio {
  try {
    funcion();
  } catch (error) {
    if (error instanceof ErrorNegocio) return error;
    throw error;
  }
  throw new Error('no lanzó ErrorNegocio');
}

describe('calcularCuotaTotal', () => {
  it('una simple usa su cuota tal cual', () => {
    expect(calcularCuotaTotal([d('2.15')]).toFixed(2)).toBe('2.15');
  });

  it('una combinada multiplica las cuotas y redondea una sola vez al final (ROUND_HALF_UP)', () => {
    // 1.85 × 2.10 × 1.55 = 6.021750 → 6.02
    expect(calcularCuotaTotal([d('1.85'), d('2.10'), d('1.55')]).toFixed(2)).toBe('6.02');
    // 1.25 × 1.25 = 1.5625 → 1.56
    expect(calcularCuotaTotal([d('1.25'), d('1.25')]).toFixed(2)).toBe('1.56');
  });
});

describe('calcularGanancia', () => {
  it('es monto × cuota redondeado a dos decimales', () => {
    expect(calcularGanancia(d('10.00'), d('2.15')).toFixed(2)).toBe('21.50');
    expect(calcularGanancia(d('3.33'), d('1.85')).toFixed(2)).toBe('6.16');
  });
});

describe('validarLimites (FR-019)', () => {
  const base = { cuota: d('2.00'), apostadoHoy: d('0.00'), limites: LIMITES };

  it('acepta un monto dentro de todos los límites', () => {
    expect(() => validarLimites({ ...base, monto: d('10.00') })).not.toThrow();
  });

  it('rechaza un monto bajo el mínimo indicando el mínimo', () => {
    const error = capturar(() => validarLimites({ ...base, monto: d('0.49') }));
    expect(error).toMatchObject({
      codigo: 'LIMITE_EXCEDIDO',
      datos: { limite: 'MONTO_MIN', valorPermitido: '0.50' },
    });
  });

  it('rechaza un monto sobre el máximo indicando el máximo', () => {
    const error = capturar(() => validarLimites({ ...base, monto: d('500.01') }));
    expect(error.datos).toEqual({ limite: 'MONTO_MAX', valorPermitido: '500.00' });
  });

  it('rechaza superar el total diario indicando cuánto queda por apostar hoy', () => {
    const error = capturar(() =>
      validarLimites({ ...base, monto: d('100.00'), apostadoHoy: d('950.00') }),
    );
    expect(error.datos).toEqual({ limite: 'DIARIO', valorPermitido: '50.00' });
  });

  it('con la ganancia sobre el máximo indica el monto máximo que sí se puede apostar con esa cuota', () => {
    const error = capturar(() =>
      validarLimites({ ...base, cuota: d('30.00'), monto: d('200.00') }),
    );
    // 5000 / 30 = 166.666… → 166.66 (hacia abajo, para no volver a superar el máximo)
    expect(error.datos).toEqual({ limite: 'GANANCIA_MAX', valorPermitido: '166.66' });
  });

  it('el mensaje explica el límite para el apostador', () => {
    const error = capturar(() => validarLimites({ ...base, monto: d('0.10') }));
    expect(error.message).toMatch(/mínimo/i);
  });
});

describe('validarCombinada', () => {
  it('acepta de 2 al máximo de selecciones de partidos distintos', () => {
    expect(() => validarCombinada(['p1', 'p2', 'p3'], 10)).not.toThrow();
  });

  it('rechaza dos selecciones del mismo partido', () => {
    const error = capturar(() => validarCombinada(['p1', 'p2', 'p1'], 10));
    expect(error).toMatchObject({ codigo: 'COMBINADA_INVALIDA' });
    expect(error.message).toMatch(/mismo partido/);
  });

  it('rechaza más selecciones que el máximo configurado', () => {
    const error = capturar(() => validarCombinada(['p1', 'p2', 'p3'], 2));
    expect(error.codigo).toBe('COMBINADA_INVALIDA');
  });

  it('una sola selección es una simple: no aplica la regla de combinadas', () => {
    expect(() => validarCombinada(['p1'], 10)).not.toThrow();
  });
});

describe('inicioDelDiaLocal (America/Guayaquil, UTC-5)', () => {
  it('a las 03:00 UTC todavía es el día anterior en Ecuador', () => {
    expect(inicioDelDiaLocal(new Date('2026-11-15T03:00:00Z')).toISOString()).toBe(
      '2026-11-14T05:00:00.000Z',
    );
  });

  it('a las 06:00 UTC ya empezó el día en Ecuador', () => {
    expect(inicioDelDiaLocal(new Date('2026-11-15T06:00:00Z')).toISOString()).toBe(
      '2026-11-15T05:00:00.000Z',
    );
  });
});
