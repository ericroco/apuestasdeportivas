import { bonoDePrueba } from '../../test/fabricas/promociones.js';
import { Prisma } from '../generated/prisma/client.js';
import { aVistaBono, porcentajeDeAvance } from './bono.vista.js';

const d = (valor: string) => new Prisma.Decimal(valor);

describe('porcentajeDeAvance', () => {
  it.each([
    ['0', '50', 0],
    ['12.50', '50', 25],
    ['49.99', '50', 99],
    ['50', '50', 100],
    ['80', '50', 100],
  ])('avance %s de %s → %i %%', (avance, requisito, esperado) => {
    expect(porcentajeDeAvance(d(avance), d(requisito))).toBe(esperado);
  });
});

describe('aVistaBono', () => {
  it('serializa montos como texto decimal y fechas en ISO', () => {
    const vista = aVistaBono({
      ...bonoDePrueba({ avance: d('12.5') }),
      cupon: { codigo: 'BIENVENIDA10' },
    });

    expect(vista).toEqual({
      id: bonoDePrueba().id,
      monto: '10.00',
      requisito: '50.00',
      avance: '12.50',
      porcentajeAvance: 25,
      estado: 'ACTIVO',
      otorgadoEn: '2026-11-10T00:00:00.000Z',
      venceEn: '2026-12-10T00:00:00.000Z',
      cumplidoEn: null,
      montoConvertido: null,
      codigoCupon: 'BIENVENIDA10',
    });
  });
});
