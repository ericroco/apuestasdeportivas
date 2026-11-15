import { apuestaGratisDePrueba, cuponDePrueba } from '../../test/fabricas/promociones.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import { Prisma } from '../generated/prisma/client.js';
import { planificarCambios } from './cupones.reglas.js';

const d = (valor: string) => new Prisma.Decimal(valor);

function codigoDeError(accion: () => unknown): string | undefined {
  try {
    accion();
  } catch (error) {
    if (error instanceof ErrorNegocio) return error.codigo;
    throw error;
  }
  return undefined;
}

describe('planificarCambios', () => {
  it('pausar registra cupon.pausado y cambia solo el estado', () => {
    const plan = planificarCambios(cuponDePrueba({ canjes: 3 }), { estado: 'PAUSADO' });

    expect(plan.datos).toEqual({ estado: 'PAUSADO' });
    expect(plan.acciones).toEqual(['cupon.pausado']);
  });

  it('reactivar registra cupon.reactivado', () => {
    const plan = planificarCambios(cuponDePrueba({ estado: 'PAUSADO' }), { estado: 'ACTIVO' });

    expect(plan.acciones).toEqual(['cupon.reactivado']);
  });

  it('con canjes permite extender la vigencia y ampliar el cupo (cupon.actualizado)', () => {
    const terminaEn = new Date('2027-02-01T00:00:00Z');

    const plan = planificarCambios(cuponDePrueba({ canjes: 5 }), { terminaEn, cupoTotal: 20 });

    expect(plan.datos).toEqual({ terminaEn, cupoTotal: 20 });
    expect(plan.acciones).toEqual(['cupon.actualizado']);
  });

  it('rechaza acortar la vigencia o reducir el cupo (CAMBIO_NO_PERMITIDO)', () => {
    const cupon = cuponDePrueba();

    expect(codigoDeError(() => planificarCambios(cupon, { cupoTotal: 9 }))).toBe(
      'CAMBIO_NO_PERMITIDO',
    );
    expect(
      codigoDeError(() =>
        planificarCambios(cupon, { terminaEn: new Date('2026-12-30T00:00:00Z') }),
      ),
    ).toBe('CAMBIO_NO_PERMITIDO');
  });

  it.each([
    { tipo: 'APUESTA_GRATIS' as const, montoFijo: d('5') },
    { porcentaje: d('20') },
    { apuestaMaxima: d('80') },
    { iniciaEn: new Date('2026-11-02T00:00:00Z') },
    { limitePorUsuario: 2 },
  ])('con canjes rechaza cambiar %j (CUPON_CON_CANJES)', (cambios) => {
    expect(codigoDeError(() => planificarCambios(cuponDePrueba({ canjes: 1 }), cambios))).toBe(
      'CUPON_CON_CANJES',
    );
  });

  it('con canjes acepta enviar el mismo valor que ya tiene (no es un cambio)', () => {
    const plan = planificarCambios(cuponDePrueba({ canjes: 1 }), {
      porcentaje: d('10.00'),
      estado: 'ACTIVO',
    });

    expect(plan.datos).toEqual({});
    expect(plan.acciones).toEqual([]);
  });

  it('sin canjes permite cambiar el tipo y limpia los campos del tipo anterior', () => {
    const plan = planificarCambios(cuponDePrueba(), { tipo: 'APUESTA_GRATIS', montoFijo: d('5') });

    expect(plan.datos).toEqual({
      tipo: 'APUESTA_GRATIS',
      montoFijo: d('5'),
      porcentaje: null,
      apuestaMaxima: null,
    });
    expect(plan.acciones).toEqual(['cupon.actualizado']);
  });

  it('valida la configuración resultante según el tipo (DATOS_INVALIDOS)', () => {
    expect(codigoDeError(() => planificarCambios(cuponDePrueba(), { tipo: 'BONO_DEPOSITO' }))).toBe(
      'DATOS_INVALIDOS',
    );
    expect(codigoDeError(() => planificarCambios(cuponDePrueba(), { porcentaje: d('150') }))).toBe(
      'DATOS_INVALIDOS',
    );
    expect(
      codigoDeError(() => planificarCambios(apuestaGratisDePrueba(), { topeBono: d('1') })),
    ).toBe('DATOS_INVALIDOS');
  });

  it('rechaza un inicio posterior al fin de vigencia', () => {
    expect(
      codigoDeError(() =>
        planificarCambios(cuponDePrueba(), { iniciaEn: new Date('2027-01-01T00:00:00Z') }),
      ),
    ).toBe('DATOS_INVALIDOS');
  });

  it('pausar y extender a la vez registra ambas acciones', () => {
    const plan = planificarCambios(cuponDePrueba(), {
      estado: 'PAUSADO',
      cupoTotal: 30,
    });

    expect(plan.acciones).toEqual(['cupon.actualizado', 'cupon.pausado']);
  });
});
