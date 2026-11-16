import { resolverAlFinal, resolverDecidida } from './reglas-mercado.js';

const sel = (tipo: string, codigo: string, linea: string | null = null) =>
  ({ tipo, codigo, linea }) as Parameters<typeof resolverAlFinal>[0];

describe('resolverAlFinal: marcador del tiempo reglamentario (FR-004)', () => {
  it.each([
    ['LOCAL', 2, 1, 'GANADORA'],
    ['LOCAL', 1, 1, 'PERDEDORA'],
    ['EMPATE', 1, 1, 'GANADORA'],
    ['EMPATE', 0, 2, 'PERDEDORA'],
    ['VISITANTE', 0, 2, 'GANADORA'],
    ['VISITANTE', 3, 0, 'PERDEDORA'],
  ] as const)('RESULTADO_FINAL %s con %i-%i → %s', (codigo, local, visitante, esperado) => {
    expect(resolverAlFinal(sel('RESULTADO_FINAL', codigo), local, visitante)).toBe(esperado);
  });

  it.each([
    ['LOCAL_EMPATE', 1, 1, 'GANADORA'],
    ['LOCAL_EMPATE', 0, 1, 'PERDEDORA'],
    ['EMPATE_VISITANTE', 0, 1, 'GANADORA'],
    ['EMPATE_VISITANTE', 2, 0, 'PERDEDORA'],
    ['LOCAL_VISITANTE', 2, 0, 'GANADORA'],
    ['LOCAL_VISITANTE', 1, 1, 'PERDEDORA'],
  ] as const)('DOBLE_OPORTUNIDAD %s con %i-%i → %s', (codigo, local, visitante, esperado) => {
    expect(resolverAlFinal(sel('DOBLE_OPORTUNIDAD', codigo), local, visitante)).toBe(esperado);
  });

  it.each([
    ['MAS', '2.5', 2, 1, 'GANADORA'],
    ['MAS', '2.5', 1, 1, 'PERDEDORA'],
    ['MENOS', '2.5', 1, 1, 'GANADORA'],
    ['MENOS', '0.5', 0, 1, 'PERDEDORA'],
    ['MENOS', '0.5', 0, 0, 'GANADORA'],
  ] as const)(
    'MAS_MENOS_GOLES %s %s con %i-%i → %s',
    (codigo, linea, local, visitante, esperado) => {
      expect(resolverAlFinal(sel('MAS_MENOS_GOLES', codigo, linea), local, visitante)).toBe(
        esperado,
      );
    },
  );

  it.each([
    ['SI', 1, 1, 'GANADORA'],
    ['SI', 2, 0, 'PERDEDORA'],
    ['NO', 2, 0, 'GANADORA'],
    ['NO', 1, 3, 'PERDEDORA'],
  ] as const)('AMBOS_MARCAN %s con %i-%i → %s', (codigo, local, visitante, esperado) => {
    expect(resolverAlFinal(sel('AMBOS_MARCAN', codigo), local, visitante)).toBe(esperado);
  });

  it('rechaza una línea de goles ausente', () => {
    expect(() => resolverAlFinal(sel('MAS_MENOS_GOLES', 'MAS', null), 1, 1)).toThrow(/línea/);
  });
});

describe('resolverDecidida: mercados ya decididos antes del final (FR-031)', () => {
  it('"más de 1.5" con 2 goles ya está ganada y "menos de 1.5" perdida', () => {
    expect(resolverDecidida(sel('MAS_MENOS_GOLES', 'MAS', '1.5'), 2, 0)).toBe('GANADORA');
    expect(resolverDecidida(sel('MAS_MENOS_GOLES', 'MENOS', '1.5'), 2, 0)).toBe('PERDEDORA');
  });

  it('"más de 2.5" con 2 goles todavía no está decidida', () => {
    expect(resolverDecidida(sel('MAS_MENOS_GOLES', 'MAS', '2.5'), 1, 1)).toBeNull();
    expect(resolverDecidida(sel('MAS_MENOS_GOLES', 'MENOS', '2.5'), 1, 1)).toBeNull();
  });

  it('"ambos marcan: sí" con goles de los dos ya está ganada y "no" perdida', () => {
    expect(resolverDecidida(sel('AMBOS_MARCAN', 'SI'), 1, 1)).toBe('GANADORA');
    expect(resolverDecidida(sel('AMBOS_MARCAN', 'NO'), 1, 1)).toBe('PERDEDORA');
  });

  it('"ambos marcan" con un solo equipo marcando todavía no está decidida', () => {
    expect(resolverDecidida(sel('AMBOS_MARCAN', 'SI'), 2, 0)).toBeNull();
  });

  it('el resultado final y la doble oportunidad nunca se deciden antes del final', () => {
    expect(resolverDecidida(sel('RESULTADO_FINAL', 'LOCAL'), 5, 0)).toBeNull();
    expect(resolverDecidida(sel('DOBLE_OPORTUNIDAD', 'LOCAL_EMPATE'), 5, 0)).toBeNull();
  });
});
