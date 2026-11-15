import { describe, expect, it } from 'vitest';
import { hrefExportacion, hrefReportes, leerFiltrosReporte, rangoPorDefecto } from './filtros';

const HOY = '2026-12-31';

describe('filtros del dashboard', () => {
  it('usa los últimos 30 días, hoy incluido, cuando la URL no trae fechas', () => {
    expect(rangoPorDefecto(HOY)).toEqual({ desde: '2026-12-02', hasta: '2026-12-31' });
    expect(leerFiltrosReporte({}, HOY)).toEqual({
      ok: true,
      filtros: {
        desde: '2026-12-02',
        hasta: '2026-12-31',
        deporte: undefined,
        competicionId: undefined,
        usuario: undefined,
      },
    });
  });

  it('lee todos los filtros válidos', () => {
    const lectura = leerFiltrosReporte(
      {
        desde: '2026-12-01',
        hasta: '2026-12-15',
        deporte: 'fútbol',
        competicionId: '0b6f7a1c-1d2e-4f30-8a4b-5c6d7e8f9a0b',
        usuario: 'ana@correo.ec',
      },
      HOY,
    );

    expect(lectura).toEqual({
      ok: true,
      filtros: {
        desde: '2026-12-01',
        hasta: '2026-12-15',
        deporte: 'fútbol',
        competicionId: '0b6f7a1c-1d2e-4f30-8a4b-5c6d7e8f9a0b',
        usuario: 'ana@correo.ec',
      },
    });
  });

  it('explica cada filtro con formato inválido sin consultar con él', () => {
    const lectura = leerFiltrosReporte(
      { desde: '2026-13-01', deporte: "f'; drop", competicionId: '12', usuario: 'ana' },
      HOY,
    );

    expect(lectura.ok).toBe(false);
    expect(lectura.ok ? [] : lectura.errores).toEqual([
      'La fecha de inicio no es válida: usa el formato AAAA-MM-DD.',
      'El deporte solo lleva letras, números, espacios o guiones.',
      'La competición debe ser un identificador válido; elígela desde el desglose.',
      'El usuario se busca por su identificador o por su correo exacto.',
    ]);
    expect(lectura.filtros.desde).toBe('2026-13-01');
  });

  it('arma las URLs del dashboard y de la exportación con los mismos filtros', () => {
    const filtros = { desde: '2026-12-01', hasta: '2026-12-31', deporte: 'futbol' };

    expect(hrefReportes(filtros)).toBe(
      '/admin/reportes?desde=2026-12-01&hasta=2026-12-31&deporte=futbol',
    );
    expect(hrefExportacion(filtros, 'pdf')).toBe(
      '/admin/reportes/exportar?desde=2026-12-01&hasta=2026-12-31&deporte=futbol&formato=pdf',
    );
  });
});
