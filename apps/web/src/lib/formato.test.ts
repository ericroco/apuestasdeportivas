import { describe, expect, it } from 'vitest';
import {
  aFechaHoraLocal,
  aIsoDesdeLocal,
  formatearCuota,
  formatearDia,
  formatearEntero,
  formatearFecha,
  formatearFechaHora,
  formatearMonto,
  formatearPorcentaje,
} from './formato';

describe('formato de montos (texto decimal, sin convertir a número)', () => {
  it('formatea dólares con separadores de Ecuador', () => {
    expect(formatearMonto('15200.00')).toBe('$15.200,00');
    expect(formatearMonto('0.5')).toBe('$0,50');
  });

  it('conserva la precisión de montos grandes', () => {
    expect(formatearMonto('12345678901234.99')).toBe('$12.345.678.901.234,99');
  });

  it('muestra los montos negativos (GGR)', () => {
    expect(formatearMonto('-1850.50')).toContain('1.850,50');
    expect(formatearMonto('-1850.50')).toContain('-');
  });

  it('formatea porcentajes y cuotas', () => {
    expect(formatearPorcentaje('100.00')).toBe('100 %');
    expect(formatearPorcentaje('12.50')).toBe('12,5 %');
    expect(formatearCuota('1.50')).toBe('1,50');
  });

  it('formatea enteros con separador de miles', () => {
    expect(formatearEntero(1520)).toBe('1.520');
  });
});

describe('formato de fechas en la hora de Ecuador', () => {
  it('muestra el día y la hora en America/Guayaquil', () => {
    expect(formatearFecha('2026-12-01T04:59:00.000Z')).toBe('30 nov 2026');
    expect(formatearFechaHora('2026-12-01T15:30:00.000Z')).toMatch(/1 dic 2026.*10:30/);
  });

  it('muestra un día del calendario sin moverlo por la zona horaria', () => {
    expect(formatearDia('2026-12-01')).toBe('1 dic');
  });

  it('convierte entre la hora local del formulario y UTC', () => {
    expect(aIsoDesdeLocal('2026-12-01T00:00')).toBe('2026-12-01T05:00:00.000Z');
    expect(aFechaHoraLocal('2026-12-01T05:00:00.000Z')).toBe('2026-12-01T00:00');
  });

  it('rechaza una hora local con formato inválido', () => {
    expect(aIsoDesdeLocal('mañana')).toBeNull();
    expect(aIsoDesdeLocal('2026-02-30T10:00')).toBeNull();
  });
});
