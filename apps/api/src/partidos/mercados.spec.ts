import { BadRequestException } from '@nestjs/common';
import { SELECCIONES_POR_TIPO, validarMercado } from './mercados.js';

const cuotas = (...codigos: string[]) => codigos.map((codigo) => ({ codigo, cuota: '1.90' }));

describe('validarMercado', () => {
  it.each([
    ['RESULTADO_FINAL', null, ['LOCAL', 'EMPATE', 'VISITANTE']],
    ['DOBLE_OPORTUNIDAD', null, ['LOCAL_EMPATE', 'EMPATE_VISITANTE', 'LOCAL_VISITANTE']],
    ['MAS_MENOS_GOLES', '2.5', ['MAS', 'MENOS']],
    ['AMBOS_MARCAN', null, ['SI', 'NO']],
  ] as const)('acepta %s con sus selecciones completas', (tipo, linea, codigos) => {
    expect(() =>
      validarMercado({ tipo, linea, selecciones: cuotas(...codigos) as never }),
    ).not.toThrow();
    expect([...SELECCIONES_POR_TIPO[tipo]].sort()).toEqual([...codigos].sort());
  });

  it('rechaza selecciones incompletas', () => {
    expect(() =>
      validarMercado({
        tipo: 'RESULTADO_FINAL',
        linea: null,
        selecciones: cuotas('LOCAL', 'VISITANTE') as never,
      }),
    ).toThrow(/EMPATE/);
  });

  it('rechaza selecciones que no pertenecen al tipo', () => {
    expect(() =>
      validarMercado({
        tipo: 'AMBOS_MARCAN',
        linea: null,
        selecciones: cuotas('SI', 'NO', 'LOCAL') as never,
      }),
    ).toThrow(BadRequestException);
  });

  it('rechaza selecciones repetidas', () => {
    expect(() =>
      validarMercado({
        tipo: 'AMBOS_MARCAN',
        linea: null,
        selecciones: cuotas('SI', 'SI', 'NO') as never,
      }),
    ).toThrow(/repetida/);
  });

  it.each([null, '2', '2.0', '0', '-1.5', '2.25'])(
    'rechaza la línea %j en MAS_MENOS_GOLES',
    (linea) => {
      expect(() =>
        validarMercado({
          tipo: 'MAS_MENOS_GOLES',
          linea,
          selecciones: cuotas('MAS', 'MENOS') as never,
        }),
      ).toThrow(/línea/);
    },
  );

  it('rechaza una línea en un mercado que no es de goles', () => {
    expect(() =>
      validarMercado({
        tipo: 'AMBOS_MARCAN',
        linea: '1.5',
        selecciones: cuotas('SI', 'NO') as never,
      }),
    ).toThrow(/línea/);
  });

  it.each(['1.00', '0.90', '2.155', 'abc'])('rechaza la cuota %s', (cuota) => {
    expect(() =>
      validarMercado({
        tipo: 'AMBOS_MARCAN',
        linea: null,
        selecciones: [
          { codigo: 'SI', cuota },
          { codigo: 'NO', cuota: '1.90' },
        ] as never,
      }),
    ).toThrow(/cuota/);
  });
});
