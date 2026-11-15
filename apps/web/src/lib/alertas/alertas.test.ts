import { describe, expect, it, vi } from 'vitest';
import { ACCION_INICIAL } from '@/lib/acciones';
import { ALERTA } from '@/test/fixtures';
import { hrefAlertas, leerFiltrosAlertas } from './filtros';
import { leerResolucion, procesarResolucion } from './resolucion';
import { describirEvidencia } from './textos';

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor);
  return datos;
}

describe('describirEvidencia', () => {
  it('nombra las claves conocidas y lista las cuentas', () => {
    expect(describirEvidencia(ALERTA.evidencia)).toEqual([
      { clave: 'dispositivo', etiqueta: 'Dispositivo', valores: ['disp-7f3a'] },
      {
        clave: 'cuentas',
        etiqueta: 'Cuentas relacionadas',
        valores: ['usuario-ana', 'usuario-beto'],
      },
    ]);
  });

  it('formatea montos, números, fechas y valores vacíos', () => {
    const datos = describirEvidencia({
      monto: '50.00',
      promedio: 2,
      apuestas: 12,
      ocurridaEn: '2026-12-03T14:20:00.000Z',
      revisado: false,
      nota: null,
    });

    expect(datos.map((dato) => [dato.etiqueta, dato.valores])).toEqual([
      ['Monto', ['$50,00']],
      ['Promedio de las apuestas previas', ['$2,00']],
      ['Apuestas', ['12']],
      ['Ocurrida en', [expect.stringContaining('3 dic 2026')]],
      ['Revisado', ['No']],
      ['Nota', ['Sin dato']],
    ]);
  });

  it('aplana un objeto anidado en texto legible', () => {
    const [dato] = describirEvidencia({ ventana: { inicio: 'x', segundos: 60 } });

    expect(dato).toEqual({
      clave: 'ventana',
      etiqueta: 'Ventana',
      valores: ['inicio: x', 'segundos: 60'],
    });
  });
});

describe('leerResolucion', () => {
  it('acepta confirmar o descartar con una nota de 5 a 500 caracteres', () => {
    expect(leerResolucion(formulario({ estado: 'CONFIRMADA', nota: '  Mismo titular  ' }))).toEqual(
      {
        ok: true,
        solicitud: { estado: 'CONFIRMADA', nota: 'Mismo titular' },
      },
    );
  });

  it.each([
    [{ estado: 'CONFIRMADA', nota: 'ok' }, 'al menos 5 caracteres'],
    [{ estado: 'CONFIRMADA', nota: 'x'.repeat(501) }, 'como máximo 500 caracteres'],
    [{ estado: 'ABIERTA', nota: 'Una nota válida' }, 'Elige Confirmar fraude o Descartar alerta'],
  ])('rechaza %o', (campos, mensaje) => {
    const lectura = leerResolucion(formulario(campos));

    expect(lectura.ok ? '' : lectura.mensaje).toContain(mensaje);
  });
});

describe('procesarResolucion', () => {
  it('resuelve y nombra la decisión en el mensaje', async () => {
    const resolver = vi.fn().mockResolvedValue({
      tipo: 'ok',
      datos: { ...ALERTA, estado: 'DESCARTADA' },
    });

    const estado = await procesarResolucion(
      ACCION_INICIAL,
      formulario({ estado: 'DESCARTADA', nota: 'Familia en la misma casa' }),
      resolver,
    );

    expect(resolver).toHaveBeenCalledWith({
      estado: 'DESCARTADA',
      nota: 'Familia en la misma casa',
    });
    expect(estado).toEqual({
      resultado: 'exito',
      mensaje: 'Alerta descartada. La resolución quedó registrada con tu nota.',
      intento: 1,
    });
  });

  it('avisa si otra persona ya la resolvió', async () => {
    const resolver = vi.fn().mockResolvedValue({
      tipo: 'rechazo',
      estado: 409,
      codigo: 'ALERTA_RESUELTA',
      mensaje: 'x',
    });

    const estado = await procesarResolucion(
      ACCION_INICIAL,
      formulario({ estado: 'CONFIRMADA', nota: 'Mismo titular' }),
      resolver,
    );

    expect(estado.resultado).toBe('error');
    expect(estado.mensaje).toContain('Otra persona ya resolvió esta alerta');
  });

  it('no llama a la API sin una nota válida', async () => {
    const resolver = vi.fn();

    const estado = await procesarResolucion(
      ACCION_INICIAL,
      formulario({ estado: 'CONFIRMADA', nota: '' }),
      resolver,
    );

    expect(resolver).not.toHaveBeenCalled();
    expect(estado.resultado).toBe('error');
  });
});

describe('filtros de alertas en la URL', () => {
  it('arma la URL con los filtros y la página', () => {
    const filtros = leerFiltrosAlertas({ estado: 'ABIERTA', severidad: 'ALTA', pagina: '3' });

    expect(hrefAlertas(filtros, 2)).toBe('/admin/alertas?estado=ABIERTA&severidad=ALTA&pagina=2');
    expect(hrefAlertas(filtros)).toBe('/admin/alertas?estado=ABIERTA&severidad=ALTA');
  });
});
