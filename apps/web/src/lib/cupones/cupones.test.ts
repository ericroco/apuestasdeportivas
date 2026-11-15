import { describe, expect, it, vi } from 'vitest';
import { ACCION_INICIAL } from '@/lib/acciones';
import { CUPON, CUPON_CUOTA } from '@/test/fixtures';
import { leerAmpliacion, leerCambioEstado, leerExtension, procesarCambioCupon } from './cambios';
import { FORMULARIO_INICIAL, leerFormularioCupon, procesarCreacionCupon } from './formulario';
import { condicionesCupon, estadoVisible, valorCupon } from './textos';

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor);
  return datos;
}

const COMUNES = {
  codigo: ' bienvenida 10 ',
  iniciaEn: '2026-12-01T00:00',
  terminaEn: '2027-01-31T23:59',
  cupoTotal: '500',
  limitePorUsuario: '1',
};

describe('leerFormularioCupon', () => {
  it('arma un bono de depósito normalizando el código y los decimales', () => {
    const lectura = leerFormularioCupon(
      formulario({
        ...COMUNES,
        tipo: 'BONO_DEPOSITO',
        porcentaje: '100',
        topeBono: '10,5',
        depositoMinimo: '10',
      }),
    );

    expect(lectura).toEqual({
      ok: true,
      solicitud: {
        codigo: 'BIENVENIDA10',
        tipo: 'BONO_DEPOSITO',
        porcentaje: '100.00',
        topeBono: '10.50',
        depositoMinimo: '10.00',
        iniciaEn: '2026-12-01T05:00:00.000Z',
        terminaEn: '2027-02-01T04:59:00.000Z',
        cupoTotal: 500,
        limitePorUsuario: 1,
      },
    });
  });

  it('envía solo los campos del tipo elegido', () => {
    const lectura = leerFormularioCupon(
      formulario({ ...COMUNES, tipo: 'APUESTA_GRATIS', montoFijo: '5', porcentaje: '50' }),
    );

    expect(lectura.ok && lectura.solicitud).toEqual(
      expect.not.objectContaining({ porcentaje: expect.anything() }),
    );
    expect(lectura.ok && lectura.solicitud).toEqual(
      expect.objectContaining({ tipo: 'APUESTA_GRATIS', montoFijo: '5.00' }),
    );
  });

  it('indica qué campo corregir', () => {
    const lectura = leerFormularioCupon(
      formulario({
        ...COMUNES,
        codigo: 'ab',
        tipo: 'AUMENTO_CUOTA',
        porcentaje: '150',
        apuestaMaxima: '0',
        cupoTotal: '0',
        terminaEn: '2026-11-30T00:00',
      }),
    );

    expect(lectura.ok).toBe(false);
    const errores = lectura.ok ? {} : lectura.errores;
    expect(Object.keys(errores).sort()).toEqual(
      ['apuestaMaxima', 'codigo', 'cupoTotal', 'porcentaje', 'terminaEn'].sort(),
    );
    expect(errores.porcentaje).toContain('1 a 100');
    expect(errores.terminaEn).toContain('posterior al inicio');
  });

  it('pide elegir el tipo', () => {
    const lectura = leerFormularioCupon(formulario(COMUNES));

    expect(lectura.ok ? null : lectura.errores.tipo).toBe('Elige el tipo de cupón.');
  });
});

describe('procesarCreacionCupon', () => {
  const datosValidos = { ...COMUNES, tipo: 'APUESTA_GRATIS', montoFijo: '5' };

  it('devuelve el cupón creado sin llamar dos veces', async () => {
    const crear = vi.fn().mockResolvedValue({ tipo: 'ok', datos: CUPON });

    const resultado = await procesarCreacionCupon(
      FORMULARIO_INICIAL,
      formulario(datosValidos),
      crear,
    );

    expect(resultado).toEqual({ tipo: 'creado', id: CUPON.id });
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it('no llama a la API si el formulario tiene errores y conserva lo escrito', async () => {
    const crear = vi.fn();

    const resultado = await procesarCreacionCupon(
      FORMULARIO_INICIAL,
      formulario({ ...datosValidos, montoFijo: 'cinco' }),
      crear,
    );

    expect(crear).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      tipo: 'formulario',
      estado: expect.objectContaining({
        intento: 1,
        mensaje: null,
        valores: expect.objectContaining({ montoFijo: 'cinco', tipo: 'APUESTA_GRATIS' }),
      }),
    });
  });

  it('traduce el código del contrato a un mensaje útil', async () => {
    const crear = vi.fn().mockResolvedValue({
      tipo: 'rechazo',
      estado: 409,
      codigo: 'CODIGO_DUPLICADO',
      mensaje: 'duplicado',
    });

    const resultado = await procesarCreacionCupon(
      FORMULARIO_INICIAL,
      formulario(datosValidos),
      crear,
    );

    expect(resultado.tipo === 'formulario' && resultado.estado.mensaje).toContain(
      'Ya existe un cupón con ese código',
    );
  });
});

describe('cambios de un cupón', () => {
  it('lee pausar y reactivar', () => {
    expect(leerCambioEstado(formulario({ estado: 'PAUSADO' }))).toEqual({
      ok: true,
      cambio: { estado: 'PAUSADO' },
    });
    expect(leerCambioEstado(formulario({ estado: 'BORRADO' })).ok).toBe(false);
  });

  it('lee la nueva vigencia en hora de Ecuador', () => {
    expect(leerExtension(formulario({ terminaEn: '2027-03-01T00:00' }))).toEqual({
      ok: true,
      cambio: { terminaEn: '2027-03-01T05:00:00.000Z' },
    });
    expect(leerExtension(formulario({ terminaEn: '' })).ok).toBe(false);
  });

  it('lee el nuevo cupo como entero positivo', () => {
    expect(leerAmpliacion(formulario({ cupoTotal: '750' }))).toEqual({
      ok: true,
      cambio: { cupoTotal: 750 },
    });
    expect(leerAmpliacion(formulario({ cupoTotal: '7.5' })).ok).toBe(false);
  });

  it('procesa el cambio y anuncia el resultado', async () => {
    const actualizar = vi.fn().mockResolvedValue({ tipo: 'ok', datos: CUPON_CUOTA });

    const estado = await procesarCambioCupon(
      ACCION_INICIAL,
      leerCambioEstado(formulario({ estado: 'PAUSADO' })),
      actualizar,
    );

    expect(actualizar).toHaveBeenCalledWith({ estado: 'PAUSADO' });
    expect(estado).toEqual({
      resultado: 'exito',
      mensaje: 'Cupón pausado. No acepta canjes nuevos hasta que lo reactives.',
      intento: 1,
    });
  });

  it('no llama a la API con un dato inválido', async () => {
    const actualizar = vi.fn();

    const estado = await procesarCambioCupon(
      ACCION_INICIAL,
      leerAmpliacion(formulario({ cupoTotal: '-1' })),
      actualizar,
    );

    expect(actualizar).not.toHaveBeenCalled();
    expect(estado.resultado).toBe('error');
  });

  it('explica un cambio que la API no permite', async () => {
    const actualizar = vi.fn().mockResolvedValue({
      tipo: 'rechazo',
      estado: 409,
      codigo: 'CAMBIO_NO_PERMITIDO',
      mensaje: 'x',
    });

    const estado = await procesarCambioCupon(
      ACCION_INICIAL,
      leerAmpliacion(formulario({ cupoTotal: '10' })),
      actualizar,
    );

    expect(estado.mensaje).toContain('el cupo solo se puede ampliar');
  });
});

describe('textos del cupón', () => {
  it('describe el valor y las condiciones de cada tipo', () => {
    expect(valorCupon(CUPON)).toBe('100 % del depósito, hasta $10,00');
    expect(condicionesCupon(CUPON)).toBe('Depósito mínimo $10,00');
    expect(valorCupon(CUPON_CUOTA)).toBe('+10 % a la cuota total');
    expect(condicionesCupon(CUPON_CUOTA)).toBe('Apuesta máxima $20,00');
    expect(valorCupon({ ...CUPON, tipo: 'APUESTA_GRATIS', montoFijo: '5.00' })).toBe(
      'Apuesta gratis de $5,00',
    );
  });

  it('muestra el estado que entiende el operador', () => {
    expect(estadoVisible(CUPON)).toBe('activo');
    expect(estadoVisible(CUPON_CUOTA)).toBe('pausado');
    expect(estadoVisible({ ...CUPON, vigente: false })).toBe('fuera-de-vigencia');
    expect(estadoVisible({ ...CUPON, canjes: 500 })).toBe('agotado');
  });
});
