// Datos iniciales de la API simulada (cumplen specs/004-promociones-fraude-reportes/contracts/api-rest.md).
import { randomUUID } from 'node:crypto';

const CAMPOS_TIPO = ['porcentaje', 'montoFijo', 'topeBono', 'depositoMinimo', 'apuestaMaxima'];

/** @param {Record<string, unknown>} datos */
export function nuevoCupon(datos) {
  const ahora = new Date().toISOString();
  const cupon = {
    id: randomUUID(),
    codigo: String(datos.codigo).toUpperCase(),
    tipo: datos.tipo,
    iniciaEn: datos.iniciaEn,
    terminaEn: datos.terminaEn,
    cupoTotal: datos.cupoTotal,
    limitePorUsuario: datos.limitePorUsuario ?? 1,
    canjes: datos.canjes ?? 0,
    estado: datos.estado ?? 'ACTIVO',
    creadoEn: datos.creadoEn ?? ahora,
    resumenCanjes: datos.resumenCanjes ?? { aceptados: 0, rechazados: 0, bonoOtorgado: '0.00' },
  };
  for (const campo of CAMPOS_TIPO) cupon[campo] = datos[campo] ?? null;
  return cupon;
}

/**
 * Vista del cupón del contrato: sin el resumen de canjes (solo va en el detalle) y con `vigente`.
 * @param {ReturnType<typeof nuevoCupon>} cupon
 */
export function vistaCupon(cupon) {
  const vista = Object.fromEntries(
    Object.entries(cupon).filter(([clave]) => clave !== 'resumenCanjes'),
  );
  const ahora = Date.now();
  const vigente = Date.parse(cupon.iniciaEn) <= ahora && ahora < Date.parse(cupon.terminaEn);
  return { ...vista, vigente };
}

export const CUPONES = [
  nuevoCupon({
    codigo: 'BIENVENIDA10',
    tipo: 'BONO_DEPOSITO',
    porcentaje: '100.00',
    topeBono: '10.00',
    depositoMinimo: '10.00',
    iniciaEn: '2026-01-01T05:00:00.000Z',
    terminaEn: '2030-12-31T04:59:59.000Z',
    cupoTotal: 500,
    canjes: 40,
    creadoEn: '2026-11-01T15:00:00.000Z',
    resumenCanjes: { aceptados: 40, rechazados: 3, bonoOtorgado: '400.00' },
  }),
  nuevoCupon({
    codigo: 'GRATIS5',
    tipo: 'APUESTA_GRATIS',
    montoFijo: '5.00',
    iniciaEn: '2026-01-01T05:00:00.000Z',
    terminaEn: '2030-12-31T04:59:59.000Z',
    cupoTotal: 100,
    canjes: 12,
    estado: 'PAUSADO',
    creadoEn: '2026-10-01T15:00:00.000Z',
    resumenCanjes: { aceptados: 12, rechazados: 1, bonoOtorgado: '60.00' },
  }),
];

/** @param {Partial<Record<string, unknown>>} datos */
export function nuevaAlerta(datos = {}) {
  return {
    id: randomUUID(),
    regla: 'CUENTAS_DISPOSITIVO',
    severidad: 'ALTA',
    usuarioId: 'usuario-ana',
    evidencia: { dispositivo: 'disp-7f3a', cuentas: ['usuario-ana', 'usuario-beto'] },
    estado: 'ABIERTA',
    nota: null,
    resueltaPor: null,
    resueltaEn: null,
    creadaEn: new Date().toISOString(),
    ...datos,
  };
}

export const ALERTAS = [
  nuevaAlerta({ creadaEn: '2026-12-03T14:20:00.000Z' }),
  nuevaAlerta({
    regla: 'RAFAGA_APUESTAS',
    severidad: 'MEDIA',
    usuarioId: 'usuario-carla',
    evidencia: { apuestas: 14, ventanaSegundos: 60 },
    creadaEn: '2026-12-02T10:00:00.000Z',
  }),
];

export const MIS_BONOS = {
  activo: {
    id: 'b1',
    monto: '10.00',
    requisito: '50.00',
    avance: '12.50',
    porcentajeAvance: 25,
    estado: 'ACTIVO',
    otorgadoEn: '2026-12-02T15:00:00.000Z',
    venceEn: '2027-01-01T15:00:00.000Z',
    codigoCupon: 'BIENVENIDA10',
  },
  historial: [
    {
      id: 'b0',
      monto: '5.00',
      requisito: '25.00',
      avance: '25.00',
      porcentajeAvance: 100,
      estado: 'CUMPLIDO',
      otorgadoEn: '2026-11-01T15:00:00.000Z',
      venceEn: '2026-12-01T15:00:00.000Z',
      codigoCupon: 'GRATIS5',
      montoConvertido: '7.40',
      cumplidoEn: '2026-11-20T18:30:00.000Z',
    },
  ],
  canjesRechazados: [
    {
      codigo: 'DOBLE20',
      motivo: {
        codigo: 'BONO_ACTIVO',
        mensaje: 'Ya tienes un bono activo; termina su rollover antes de usar otro.',
      },
      creadoEn: '2026-12-05T20:00:00.000Z',
    },
  ],
  cuotaMinima: '1.50',
};
