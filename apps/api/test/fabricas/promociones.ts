import { Prisma, type Bono, type Cupon } from '../../src/generated/prisma/client.js';

const d = (valor: string): Prisma.Decimal => new Prisma.Decimal(valor);

/** Cupón completo para pruebas unitarias; por defecto, aumento de cuota del 10 % activo y con cupo. */
export function cuponDePrueba(parcial: Partial<Cupon> = {}): Cupon {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    codigo: 'CUOTA10',
    tipo: 'AUMENTO_CUOTA',
    porcentaje: d('10'),
    montoFijo: null,
    topeBono: null,
    depositoMinimo: null,
    apuestaMaxima: d('50'),
    iniciaEn: new Date('2026-11-01T00:00:00Z'),
    terminaEn: new Date('2026-12-31T00:00:00Z'),
    cupoTotal: 10,
    limitePorUsuario: 1,
    canjes: 0,
    estado: 'ACTIVO',
    creadoPor: 'operador-1',
    creadoEn: new Date('2026-11-01T00:00:00Z'),
    actualizadoEn: new Date('2026-11-01T00:00:00Z'),
    ...parcial,
  };
}

export function apuestaGratisDePrueba(parcial: Partial<Cupon> = {}): Cupon {
  return cuponDePrueba({
    codigo: 'GRATIS5',
    tipo: 'APUESTA_GRATIS',
    porcentaje: null,
    apuestaMaxima: null,
    montoFijo: d('5'),
    ...parcial,
  });
}

export function bonoDepositoDePrueba(parcial: Partial<Cupon> = {}): Cupon {
  return cuponDePrueba({
    codigo: 'BIENVENIDA10',
    tipo: 'BONO_DEPOSITO',
    porcentaje: d('100'),
    apuestaMaxima: null,
    topeBono: d('10'),
    depositoMinimo: d('10'),
    ...parcial,
  });
}

export function bonoDePrueba(parcial: Partial<Bono> = {}): Bono {
  return {
    id: '00000000-0000-4000-8000-0000000000b0',
    usuarioId: 'apostador-1',
    cuponId: '00000000-0000-4000-8000-000000000001',
    canjeId: '00000000-0000-4000-8000-0000000000c0',
    monto: d('10'),
    requisito: d('50'),
    avance: d('0'),
    estado: 'ACTIVO',
    otorgadoEn: new Date('2026-11-10T00:00:00Z'),
    venceEn: new Date('2026-12-10T00:00:00Z'),
    cumplidoEn: null,
    montoConvertido: null,
    ...parcial,
  };
}
