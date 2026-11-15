import { ESTADOS_PARTIDO, type EstadoPartido } from '@apuestas/shared';
import { ErrorNegocio } from '../comun/error-negocio.js';
import {
  admiteApuestas,
  esEstadoFinal,
  rutaDeEstados,
  transicionesPermitidas,
  validarTransicion,
} from './maquina-estados.js';

// Tabla de data-model.md: cualquier par que no esté aquí es una transición prohibida.
const PERMITIDAS: Readonly<Record<EstadoPartido, readonly EstadoPartido[]>> = {
  PROGRAMADO: ['EN_VIVO', 'APLAZADO', 'CANCELADO'],
  EN_VIVO: ['FINALIZADO', 'SUSPENDIDO', 'CANCELADO'],
  SUSPENDIDO: ['EN_VIVO', 'CANCELADO'],
  APLAZADO: ['PROGRAMADO', 'CANCELADO'],
  FINALIZADO: [],
  CANCELADO: [],
};

const TODOS_LOS_PARES = ESTADOS_PARTIDO.flatMap((desde) =>
  ESTADOS_PARTIDO.map((hacia) => [desde, hacia] as const),
);

describe('máquina de estados del partido', () => {
  it.each(TODOS_LOS_PARES.filter(([desde, hacia]) => PERMITIDAS[desde].includes(hacia)))(
    'permite %s → %s',
    (desde, hacia) => {
      expect(() => validarTransicion(desde, hacia)).not.toThrow();
    },
  );

  it.each(TODOS_LOS_PARES.filter(([desde, hacia]) => !PERMITIDAS[desde].includes(hacia)))(
    'rechaza %s → %s con TRANSICION_INVALIDA',
    (desde, hacia) => {
      expect(() => validarTransicion(desde, hacia)).toThrow(ErrorNegocio);
    },
  );

  it('indica las transiciones permitidas en el error', () => {
    try {
      validarTransicion('FINALIZADO', 'PROGRAMADO');
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        codigo: 'TRANSICION_INVALIDA',
        estadoHttp: 409,
        datos: { desde: 'FINALIZADO', hacia: 'PROGRAMADO', permitidas: [] },
      });
    }
  });

  it('devuelve las transiciones permitidas de cada estado', () => {
    for (const estado of ESTADOS_PARTIDO) {
      expect([...transicionesPermitidas(estado)].sort()).toEqual([...PERMITIDAS[estado]].sort());
    }
  });

  it('finalizado y cancelado son estados finales', () => {
    expect(ESTADOS_PARTIDO.filter(esEstadoFinal)).toEqual(['FINALIZADO', 'CANCELADO']);
  });

  it('solo programado y en vivo admiten apuestas', () => {
    expect(ESTADOS_PARTIDO.filter(admiteApuestas)).toEqual(['PROGRAMADO', 'EN_VIVO']);
  });
});

describe('rutaDeEstados (el proveedor puede saltarse estados entre dos consultas)', () => {
  it('devuelve el paso directo si la transición está permitida', () => {
    expect(rutaDeEstados('EN_VIVO', 'FINALIZADO')).toEqual(['FINALIZADO']);
  });

  it('pasa por en vivo si el partido terminó sin que se viera en vivo', () => {
    expect(rutaDeEstados('PROGRAMADO', 'FINALIZADO')).toEqual(['EN_VIVO', 'FINALIZADO']);
    expect(rutaDeEstados('PROGRAMADO', 'SUSPENDIDO')).toEqual(['EN_VIVO', 'SUSPENDIDO']);
  });

  it('devuelve una ruta vacía si ya está en ese estado', () => {
    expect(rutaDeEstados('EN_VIVO', 'EN_VIVO')).toEqual([]);
  });

  it('devuelve null si no hay camino (desde un estado final)', () => {
    expect(rutaDeEstados('FINALIZADO', 'EN_VIVO')).toBeNull();
  });
});
