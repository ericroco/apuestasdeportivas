import { Prisma } from '../generated/prisma/client.js';
import {
  esquemaActualizarCupon,
  esquemaCrearCupon,
  esquemaFiltrosCupones,
  normalizarCodigo,
} from './cupones.esquemas.js';

const VIGENCIA = { iniciaEn: '2026-12-01T00:00:00Z', terminaEn: '2027-01-31T23:59:59Z' };

const bonoDeposito = {
  codigo: 'BIENVENIDA10',
  tipo: 'BONO_DEPOSITO',
  porcentaje: '100.00',
  topeBono: '10.00',
  depositoMinimo: '10.00',
  ...VIGENCIA,
  cupoTotal: 500,
  limitePorUsuario: 1,
};

const apuestaGratis = {
  codigo: 'GRATIS5',
  tipo: 'APUESTA_GRATIS',
  montoFijo: '5.00',
  ...VIGENCIA,
  cupoTotal: 10,
};

const aumentoCuota = {
  codigo: 'CUOTA10',
  tipo: 'AUMENTO_CUOTA',
  porcentaje: '10',
  apuestaMaxima: '50.00',
  ...VIGENCIA,
  cupoTotal: 100,
};

function rutasConProblemas(entrada: unknown, esquema = esquemaCrearCupon): string[] {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return [];
  return resultado.error.issues.map((problema) => problema.path.join('.'));
}

describe('normalizarCodigo', () => {
  it('quita espacios y pasa a mayúsculas', () => {
    expect(normalizarCodigo('  bien venida 10 ')).toBe('BIENVENIDA10');
  });
});

describe('esquemaCrearCupon', () => {
  it('acepta un bono de depósito y convierte montos a Decimal y fechas a Date', () => {
    const cupon = esquemaCrearCupon.parse({ ...bonoDeposito, codigo: ' bienvenida10 ' });

    expect(cupon.codigo).toBe('BIENVENIDA10');
    expect(cupon.tipo).toBe('BONO_DEPOSITO');
    if (cupon.tipo !== 'BONO_DEPOSITO') throw new Error('tipo inesperado');
    expect(cupon.porcentaje).toBeInstanceOf(Prisma.Decimal);
    expect(cupon.topeBono.toFixed(2)).toBe('10.00');
    expect(cupon.iniciaEn).toEqual(new Date('2026-12-01T00:00:00Z'));
  });

  it('aplica límite por usuario 1 por defecto', () => {
    expect(esquemaCrearCupon.parse(apuestaGratis).limitePorUsuario).toBe(1);
  });

  it('acepta un aumento de cuota', () => {
    expect(rutasConProblemas(aumentoCuota)).toEqual([]);
  });

  it('rechaza un campo que no corresponde al tipo', () => {
    expect(esquemaCrearCupon.safeParse({ ...apuestaGratis, porcentaje: '10' }).success).toBe(false);
    expect(esquemaCrearCupon.safeParse({ ...aumentoCuota, topeBono: '10.00' }).success).toBe(false);
  });

  it('exige los campos obligatorios del tipo', () => {
    const { topeBono: _omitido, ...sinTope } = bonoDeposito;

    expect(rutasConProblemas(sinTope)).toContain('topeBono');
    expect(rutasConProblemas({ ...apuestaGratis, montoFijo: undefined })).toContain('montoFijo');
  });

  it.each([
    ['BONO_DEPOSITO', '200', true],
    ['BONO_DEPOSITO', '201', false],
    ['BONO_DEPOSITO', '0.5', false],
    ['AUMENTO_CUOTA', '100', true],
    ['AUMENTO_CUOTA', '100.01', false],
    ['AUMENTO_CUOTA', '1', true],
  ])('porcentaje de %s = %s → válido: %s', (tipo, porcentaje, valido) => {
    const base = tipo === 'BONO_DEPOSITO' ? bonoDeposito : aumentoCuota;

    expect(esquemaCrearCupon.safeParse({ ...base, porcentaje }).success).toBe(valido);
  });

  it('rechaza un fin de vigencia anterior o igual al inicio, nombrando terminaEn', () => {
    expect(rutasConProblemas({ ...apuestaGratis, terminaEn: VIGENCIA.iniciaEn })).toEqual([
      'terminaEn',
    ]);
  });

  it.each([0, -1, 1.5])('rechaza un cupo total de %s', (cupoTotal) => {
    expect(rutasConProblemas({ ...apuestaGratis, cupoTotal })).toEqual(['cupoTotal']);
  });

  it.each(['AB1', 'BIEN-VENIDA', 'X'.repeat(21), ''])('rechaza el código %j', (codigo) => {
    expect(rutasConProblemas({ ...apuestaGratis, codigo })).toEqual(['codigo']);
  });

  it.each(['5.001', '-5', 'cinco', '0', '0.00'])('rechaza el monto fijo %j', (montoFijo) => {
    expect(rutasConProblemas({ ...apuestaGratis, montoFijo })).toEqual(['montoFijo']);
  });

  it('rechaza montos enviados como número (deben viajar como texto decimal)', () => {
    expect(rutasConProblemas({ ...apuestaGratis, montoFijo: 5 })).toEqual(['montoFijo']);
  });

  it('acepta un depósito mínimo de 0', () => {
    expect(rutasConProblemas({ ...bonoDeposito, depositoMinimo: '0' })).toEqual([]);
  });

  it('rechaza un tipo desconocido y campos extra', () => {
    expect(esquemaCrearCupon.safeParse({ ...apuestaGratis, tipo: 'CASHBACK' }).success).toBe(false);
    expect(esquemaCrearCupon.safeParse({ ...apuestaGratis, canjes: 3 }).success).toBe(false);
  });

  it('rechaza fechas que no son ISO 8601', () => {
    expect(rutasConProblemas({ ...apuestaGratis, iniciaEn: '01/12/2026' })).toContain('iniciaEn');
  });
});

describe('esquemaActualizarCupon', () => {
  it('acepta pausar, extender la vigencia y ampliar el cupo', () => {
    const cambios = esquemaActualizarCupon.parse({
      estado: 'PAUSADO',
      terminaEn: '2027-03-01T00:00:00Z',
      cupoTotal: 900,
    });

    expect(cambios).toEqual({
      estado: 'PAUSADO',
      terminaEn: new Date('2027-03-01T00:00:00Z'),
      cupoTotal: 900,
    });
  });

  it('acepta los campos del tipo como texto decimal', () => {
    const cambios = esquemaActualizarCupon.parse({ tipo: 'APUESTA_GRATIS', montoFijo: '7.50' });

    expect(cambios.montoFijo?.toFixed(2)).toBe('7.50');
  });

  it('rechaza un cambio vacío', () => {
    expect(esquemaActualizarCupon.safeParse({}).success).toBe(false);
  });

  it('no permite cambiar el código ni los canjes', () => {
    expect(esquemaActualizarCupon.safeParse({ codigo: 'OTRO1' }).success).toBe(false);
    expect(esquemaActualizarCupon.safeParse({ canjes: 0 }).success).toBe(false);
  });

  it('rechaza un estado desconocido', () => {
    expect(esquemaActualizarCupon.safeParse({ estado: 'BORRADO' }).success).toBe(false);
  });
});

describe('esquemaFiltrosCupones', () => {
  it('aplica la paginación por defecto e ignora filtros vacíos', () => {
    expect(esquemaFiltrosCupones.parse({ estado: '', tipo: '', busqueda: '' })).toEqual({
      pagina: 1,
      tamano: 20,
    });
  });

  it('convierte la paginación que llega como texto', () => {
    expect(esquemaFiltrosCupones.parse({ pagina: '2', tamano: '50', estado: 'ACTIVO' })).toEqual({
      pagina: 2,
      tamano: 50,
      estado: 'ACTIVO',
    });
  });

  it.each([{ tamano: '101' }, { tamano: '0' }, { pagina: '0' }, { estado: 'OTRO' }, { x: '1' }])(
    'rechaza %j',
    (filtros) => {
      expect(esquemaFiltrosCupones.safeParse(filtros).success).toBe(false);
    },
  );
});
