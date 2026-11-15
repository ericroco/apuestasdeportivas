import {
  apuestaGratisDePrueba,
  bonoDepositoDePrueba,
  cuponDePrueba,
} from '../../test/fabricas/promociones.js';
import { CuponInvalidoError } from '../contracts/promociones.port.js';
import { Prisma } from '../generated/prisma/client.js';
import { CuponRechazadoError, motivo } from './motivos.js';
import {
  calcularBonoDeposito,
  calcularCuotaFinal,
  calcularRequisito,
  calcularVencimiento,
  motivoDeApuesta,
  motivoDeDeposito,
  motivoDeDisponibilidad,
  otorgaBono,
} from './reglas-canje.js';

const d = (valor: string) => new Prisma.Decimal(valor);
const AHORA = new Date('2026-11-15T12:00:00Z');

describe('motivoDeDisponibilidad (reloj del servidor)', () => {
  it('un cupón activo, vigente y con cupo está disponible', () => {
    expect(motivoDeDisponibilidad(cuponDePrueba(), AHORA)).toBeNull();
  });

  it('está disponible justo en el instante de inicio', () => {
    expect(motivoDeDisponibilidad(cuponDePrueba({ iniciaEn: AHORA }), AHORA)).toBeNull();
  });

  it.each([
    [{ estado: 'PAUSADO' as const }, 'CUPON_PAUSADO'],
    [{ iniciaEn: new Date('2026-11-15T12:00:01Z') }, 'CUPON_NO_VIGENTE'],
    [{ terminaEn: AHORA }, 'CUPON_VENCIDO'],
    [{ terminaEn: new Date('2026-11-01T00:00:01Z') }, 'CUPON_VENCIDO'],
    [{ canjes: 10, cupoTotal: 10 }, 'CUPON_AGOTADO'],
  ])('%j → %s', (parcial, esperado) => {
    expect(motivoDeDisponibilidad(cuponDePrueba(parcial), AHORA)).toBe(esperado);
  });
});

describe('motivoDeApuesta', () => {
  it('un bono de depósito no se usa en apuestas', () => {
    expect(motivoDeApuesta(bonoDepositoDePrueba(), d('5'))).toBe('TIPO_NO_APLICA');
  });

  it('la apuesta gratis no puede superar el monto del cupón', () => {
    expect(motivoDeApuesta(apuestaGratisDePrueba(), d('5.00'))).toBeNull();
    expect(motivoDeApuesta(apuestaGratisDePrueba(), d('8.00'))).toBe('MONTO_SUPERA_CUPON');
  });

  it('el aumento de cuota respeta el monto máximo de apuesta', () => {
    expect(motivoDeApuesta(cuponDePrueba(), d('50'))).toBeNull();
    expect(motivoDeApuesta(cuponDePrueba(), d('50.01'))).toBe('MONTO_SUPERA_CUPON');
  });
});

describe('motivoDeDeposito', () => {
  it('solo los bonos de depósito se usan al depositar', () => {
    expect(motivoDeDeposito(apuestaGratisDePrueba(), d('20'))).toBe('TIPO_NO_APLICA');
  });

  it('exige el depósito mínimo', () => {
    expect(motivoDeDeposito(bonoDepositoDePrueba(), d('5'))).toBe('DEPOSITO_INSUFICIENTE');
    expect(motivoDeDeposito(bonoDepositoDePrueba(), d('10'))).toBeNull();
  });

  it('rechaza un depósito cuyo bono calculado sería cero', () => {
    const cupon = bonoDepositoDePrueba({ depositoMinimo: d('0'), porcentaje: d('1') });

    expect(motivoDeDeposito(cupon, d('0.10'))).toBe('DEPOSITO_INSUFICIENTE');
  });
});

describe('cálculos', () => {
  it.each([
    ['2.00', '10', '2.20'],
    ['1.95', '7.5', '2.10'],
    ['3.33', '33.33', '4.44'],
    ['1.50', '100', '3.00'],
  ])('cuota %s con aumento del %s %% → %s (dos decimales)', (cuota, porcentaje, esperada) => {
    expect(calcularCuotaFinal(d(cuota), d(porcentaje)).toFixed(2)).toBe(esperada);
  });

  it.each([
    ['20.00', '100', '10.00', '10.00'],
    ['15.00', '50', '10.00', '7.50'],
    ['10.01', '33.33', '100.00', '3.33'],
    ['100.00', '200', '500.00', '200.00'],
  ])('bono de depósito de %s al %s %% con tope %s → %s', (monto, porcentaje, tope, esperado) => {
    expect(calcularBonoDeposito(d(monto), d(porcentaje), d(tope)).toFixed(2)).toBe(esperado);
  });

  it('el requisito de rollover es el bono por el multiplicador', () => {
    expect(calcularRequisito(d('10.00'), 5).toFixed(2)).toBe('50.00');
  });

  it('el bono vence a los días configurados', () => {
    expect(calcularVencimiento(AHORA, 30)).toEqual(new Date('2026-12-15T12:00:00Z'));
  });

  it('solo el bono de depósito y la apuesta gratis otorgan bono', () => {
    expect(otorgaBono('BONO_DEPOSITO')).toBe(true);
    expect(otorgaBono('APUESTA_GRATIS')).toBe(true);
    expect(otorgaBono('AUMENTO_CUOTA')).toBe(false);
  });
});

describe('motivos legibles', () => {
  it('cada código tiene su mensaje de data-model.md', () => {
    expect(motivo('LIMITE_USUARIO')).toEqual({
      codigo: 'LIMITE_USUARIO',
      mensaje: 'Ya usaste este cupón.',
    });
    expect(motivo('CUPON_AGOTADO').mensaje).toBe('El cupón se agotó.');
  });

  it('CuponRechazadoError es un CuponInvalidoError del contrato 4 con el mensaje y el código', () => {
    const error = new CuponRechazadoError('BONO_ACTIVO');

    expect(error).toBeInstanceOf(CuponInvalidoError);
    expect(error.codigo).toBe('BONO_ACTIVO');
    expect(error.message).toBe('Ya tienes un bono activo; termina su rollover antes de usar otro.');
  });
});
