import { Decimal, aTexto, cuotaTexto, montoTexto, multiplicar, redondear } from './decimal.js';

describe('redondear', () => {
  it.each([
    ['2.345', '2.35'],
    ['2.344', '2.34'],
    ['2.355', '2.36'],
    ['10', '10.00'],
  ])('redondea %s a dos decimales con ROUND_HALF_UP → %s', (valor, esperado) => {
    expect(aTexto(redondear(new Decimal(valor)))).toBe(esperado);
  });
});

describe('multiplicar', () => {
  it('multiplica sin errores de coma flotante y redondea el resultado', () => {
    expect(aTexto(multiplicar(new Decimal('0.10'), new Decimal('3.00')))).toBe('0.30');
    expect(aTexto(multiplicar(new Decimal('2.15'), new Decimal('1.85')))).toBe('3.98');
  });

  it('acepta varios factores (cuota de una combinada)', () => {
    const cuotas = ['1.50', '2.00', '1.10'].map((c) => new Decimal(c));

    expect(aTexto(multiplicar(...cuotas))).toBe('3.30');
  });
});

describe('montoTexto', () => {
  it.each(['10', '10.5', '10.50', '0.01'])('acepta %s y lo devuelve como Decimal', (valor) => {
    const resultado = montoTexto.parse(valor);

    expect(resultado).toBeInstanceOf(Decimal);
    expect(resultado.equals(new Decimal(valor))).toBe(true);
  });

  it.each(['0', '0.00', '-1', '10.505', '1e3', ' 10', 'diez', '', '1,50'])(
    'rechaza %j (cero, negativo, más de dos decimales o formato inválido)',
    (valor) => {
      expect(montoTexto.safeParse(valor).success).toBe(false);
    },
  );

  it('rechaza un número de JavaScript: los montos viajan como texto', () => {
    expect(montoTexto.safeParse(10).success).toBe(false);
  });
});

describe('cuotaTexto', () => {
  it('acepta una cuota mayor a 1.00 con hasta dos decimales', () => {
    expect(cuotaTexto.parse('1.01').equals(new Decimal('1.01'))).toBe(true);
  });

  it.each(['1.00', '1', '0.50', '2.155'])('rechaza la cuota %s', (valor) => {
    expect(cuotaTexto.safeParse(valor).success).toBe(false);
  });
});
