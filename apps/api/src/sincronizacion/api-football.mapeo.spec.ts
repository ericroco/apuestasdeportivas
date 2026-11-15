import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type RespuestaApiFootball,
  mapearCuotas,
  mapearEstado,
  mapearPartido,
} from './api-football.mapeo.js';

function leerFixture(nombre: string): RespuestaApiFootball<unknown> {
  const ruta = join(import.meta.dirname, '__fixtures__', nombre);
  return JSON.parse(readFileSync(ruta, 'utf8')) as RespuestaApiFootball<unknown>;
}

describe('mapearEstado (research.md §10)', () => {
  it.each([
    [['TBD', 'NS'], 'PROGRAMADO'],
    [['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'], 'EN_VIVO'],
    [['SUSP', 'INT', 'ABD'], 'SUSPENDIDO'],
    [['PST'], 'APLAZADO'],
    [['FT', 'AET', 'PEN'], 'FINALIZADO'],
    [['CANC', 'AWD', 'WO'], 'CANCELADO'],
  ] as const)('%j → %s', (codigos, esperado) => {
    for (const codigo of codigos) expect(mapearEstado(codigo)).toBe(esperado);
  });

  it('devuelve null con un código desconocido para no importar datos dudosos', () => {
    expect(mapearEstado('XYZ')).toBeNull();
  });
});

describe('mapearPartido', () => {
  const [programado, enVivo, conProrroga] = leerFixture('fixtures-dia.json').response;

  it('mapea un partido programado sin marcador', () => {
    expect(mapearPartido(programado)).toEqual({
      idProveedor: 1001,
      competicion: { idProveedor: 39, nombre: 'Premier League', pais: 'England', temporada: 2026 },
      nombreLocal: 'Arsenal',
      nombreVisitante: 'Chelsea',
      inicioEn: new Date('2026-11-15T20:00:00Z'),
      estado: 'PROGRAMADO',
      golesLocal: null,
      golesVisitante: null,
      minuto: null,
    });
  });

  it('en vivo usa los goles actuales y el minuto', () => {
    expect(mapearPartido(enVivo)).toMatchObject({
      estado: 'EN_VIVO',
      golesLocal: 2,
      golesVisitante: 1,
      minuto: 67,
    });
  });

  it('finalizado con prórroga usa el marcador reglamentario (score.fulltime), no los goles', () => {
    expect(mapearPartido(conProrroga)).toMatchObject({
      estado: 'FINALIZADO',
      golesLocal: 1,
      golesVisitante: 1,
      minuto: null,
    });
  });

  it('descarta un elemento con forma inesperada', () => {
    expect(mapearPartido({ fixture: { id: 'no-numero' } })).toBeNull();
    expect(mapearPartido(null)).toBeNull();
  });
});

describe('mapearCuotas', () => {
  const [cuotas] = leerFixture('odds.json').response;
  const resultado = mapearCuotas(cuotas)!;
  const mercado = (tipo: string, linea: string | null = null) =>
    resultado.mercados.find((m) => m.tipo === tipo && m.linea === linea);

  it('mapea el 1X2 redondeando la cuota a dos decimales (ROUND_HALF_UP)', () => {
    expect(resultado.idProveedorPartido).toBe(1001);
    expect(mercado('RESULTADO_FINAL')?.selecciones).toEqual([
      { codigo: 'LOCAL', cuota: '2.10' },
      { codigo: 'EMPATE', cuota: '3.40' },
      { codigo: 'VISITANTE', cuota: '3.26' },
    ]);
  });

  it('mapea la doble oportunidad', () => {
    expect(mercado('DOBLE_OPORTUNIDAD')?.selecciones.map((s) => s.codigo)).toEqual([
      'LOCAL_EMPATE',
      'EMPATE_VISITANTE',
      'LOCAL_VISITANTE',
    ]);
  });

  it('crea un mercado por cada línea de medio gol e ignora las líneas enteras', () => {
    expect(mercado('MAS_MENOS_GOLES', '2.5')?.selecciones).toEqual([
      { codigo: 'MAS', cuota: '1.90' },
      { codigo: 'MENOS', cuota: '1.90' },
    ]);
    expect(mercado('MAS_MENOS_GOLES', '1.5')).toBeDefined();
    expect(mercado('MAS_MENOS_GOLES', '3.0')).toBeUndefined();
  });

  it('descarta un mercado con alguna cuota de 1.00 o menor', () => {
    expect(mercado('AMBOS_MARCAN')).toBeUndefined();
  });

  it('ignora los mercados de tipos no soportados (FR-004)', () => {
    expect(resultado.mercados).toHaveLength(4);
  });
});
