import { describe, expect, it } from 'vitest';
import { leerFiltrosAlertas } from './alertas/filtros';
import { leerFiltrosCupones } from './cupones/filtros';
import {
  construirConsulta,
  esFechaCalendario,
  leerPagina,
  primerValor,
  valorPermitido,
} from './parametros';

describe('parámetros de la URL', () => {
  it('toma el primer valor no vacío y sin espacios', () => {
    expect(primerValor({ a: ['  x ', 'y'] }, 'a')).toBe('x');
    expect(primerValor({ a: '   ' }, 'a')).toBeUndefined();
    expect(primerValor({}, 'a')).toBeUndefined();
  });

  it('ignora un valor fuera de los permitidos', () => {
    expect(valorPermitido({ e: 'ACTIVO' }, 'e', ['ACTIVO', 'PAUSADO'])).toBe('ACTIVO');
    expect(valorPermitido({ e: 'BORRADO' }, 'e', ['ACTIVO', 'PAUSADO'])).toBeUndefined();
  });

  it.each([
    ['3', 3],
    ['0', 1],
    ['-2', 1],
    ['1e3', 1],
    ['999999', 1],
    [undefined, 1],
  ])('lee la página %s como %i', (valor, esperado) => {
    expect(leerPagina({ pagina: valor })).toBe(esperado);
  });

  it('arma la consulta solo con los valores presentes', () => {
    expect(construirConsulta({ a: 'x y', b: undefined, c: '', d: 2, e: null })).toBe('?a=x+y&d=2');
    expect(construirConsulta({ a: undefined })).toBe('');
  });

  it.each([
    ['2026-12-31', true],
    ['2026-02-30', false],
    ['2026-1-01', false],
    ['ayer', false],
  ])('reconoce %s como fecha de calendario: %s', (valor, esperado) => {
    expect(esFechaCalendario(valor)).toBe(esperado);
  });
});

describe('leerFiltrosCupones', () => {
  it('lee los filtros válidos y deja solo letras y números en la búsqueda', () => {
    expect(
      leerFiltrosCupones({
        estado: 'PAUSADO',
        tipo: 'APUESTA_GRATIS',
        busqueda: ' bien-ve',
        pagina: '2',
      }),
    ).toEqual({ estado: 'PAUSADO', tipo: 'APUESTA_GRATIS', busqueda: 'bienve', pagina: 2 });
  });

  it('descarta valores manipulados', () => {
    expect(leerFiltrosCupones({ estado: 'x', tipo: 'y', busqueda: '--' })).toEqual({
      estado: undefined,
      tipo: undefined,
      busqueda: undefined,
      pagina: 1,
    });
  });
});

describe('leerFiltrosAlertas', () => {
  it('lee los filtros válidos', () => {
    expect(
      leerFiltrosAlertas({
        estado: 'ABIERTA',
        severidad: 'MEDIA',
        regla: 'RAFAGA_APUESTAS',
        usuarioId: 'ana@correo.ec',
        desde: '2026-12-01',
        hasta: '2026-12-31',
      }),
    ).toEqual({
      estado: 'ABIERTA',
      severidad: 'MEDIA',
      regla: 'RAFAGA_APUESTAS',
      usuarioId: 'ana@correo.ec',
      desde: '2026-12-01',
      hasta: '2026-12-31',
      pagina: 1,
    });
  });

  it('descarta un usuario con caracteres no permitidos y fechas inválidas', () => {
    const filtros = leerFiltrosAlertas({ usuarioId: "a' OR 1=1", desde: '2026-13-01' });

    expect(filtros.usuarioId).toBeUndefined();
    expect(filtros.desde).toBeUndefined();
  });
});
