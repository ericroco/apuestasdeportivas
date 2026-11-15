import {
  INTERVALO_MINIMO_VIVO_MS,
  calcularIntervaloVivoMs,
  consultasReservadas,
  hayCupoNormal,
} from './frecuencia.js';

const MINUTO = 60_000;

describe('consultasReservadas', () => {
  it('reserva el 10 % del presupuesto (redondeado hacia arriba) para los resultados finales', () => {
    expect(consultasReservadas(100)).toBe(10);
    expect(consultasReservadas(5)).toBe(1);
  });
});

describe('hayCupoNormal', () => {
  it('permite consultas normales solo mientras no se toque la reserva', () => {
    expect(hayCupoNormal({ consultas: 89, presupuesto: 100 })).toBe(true);
    expect(hayCupoNormal({ consultas: 90, presupuesto: 100 })).toBe(false);
  });
});

describe('calcularIntervaloVivoMs', () => {
  it('no consulta en vivo si no hay partidos en vivo', () => {
    expect(
      calcularIntervaloVivoMs({ minutosDePartidos: [], consultas: 0, presupuesto: 100 }),
    ).toBeNull();
  });

  it('no consulta en vivo si solo queda la reserva', () => {
    expect(
      calcularIntervaloVivoMs({ minutosDePartidos: [10], consultas: 90, presupuesto: 100 }),
    ).toBeNull();
  });

  it('reparte las consultas disponibles en el tiempo que le queda al partido más largo', () => {
    // Minuto 30: quedan ~80 min (110 - 30). Hay 100 - 10 (reserva) - 50 = 40 consultas → 2 min.
    const intervalo = calcularIntervaloVivoMs({
      minutosDePartidos: [30, 70],
      consultas: 50,
      presupuesto: 100,
    });

    expect(intervalo).toBe(2 * MINUTO);
  });

  it('nunca consulta más seguido que el mínimo de 15 s', () => {
    const intervalo = calcularIntervaloVivoMs({
      minutosDePartidos: [85],
      consultas: 0,
      presupuesto: 100_000,
    });

    expect(intervalo).toBe(INTERVALO_MINIMO_VIVO_MS);
    expect(INTERVALO_MINIMO_VIVO_MS).toBe(15_000);
  });

  it('trata un partido sin minuto como recién empezado', () => {
    const conNulo = calcularIntervaloVivoMs({
      minutosDePartidos: [null],
      consultas: 0,
      presupuesto: 120,
    });

    // 110 min / (120 - 12) consultas ≈ 61 s.
    expect(conNulo).toBeGreaterThan(60_000);
    expect(conNulo).toBeLessThan(62_000);
  });
});
