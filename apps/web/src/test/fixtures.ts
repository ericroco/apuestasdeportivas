import type { DetalleCupon, MisBonos, VistaAlerta, VistaCupon } from '@apuestas/shared';

/** Datos de prueba que cumplen los contratos de contracts/api-rest.md. */

export const CUPON: VistaCupon = {
  id: '6f1d3c1e-2a4b-4c55-9d1e-0a1b2c3d4e5f',
  codigo: 'BIENVENIDA10',
  tipo: 'BONO_DEPOSITO',
  porcentaje: '100.00',
  montoFijo: null,
  topeBono: '10.00',
  depositoMinimo: '10.00',
  apuestaMaxima: null,
  iniciaEn: '2026-12-01T05:00:00.000Z',
  terminaEn: '2027-02-01T04:59:59.000Z',
  cupoTotal: 500,
  limitePorUsuario: 1,
  canjes: 40,
  estado: 'ACTIVO',
  vigente: true,
  creadoEn: '2026-11-20T15:00:00.000Z',
};

export const CUPON_CUOTA: VistaCupon = {
  ...CUPON,
  id: '7a2e4d2f-3b5c-4d66-8e2f-1b2c3d4e5f60',
  codigo: 'CUOTAMAS',
  tipo: 'AUMENTO_CUOTA',
  porcentaje: '10.00',
  topeBono: null,
  depositoMinimo: null,
  apuestaMaxima: '20.00',
  canjes: 0,
  estado: 'PAUSADO',
};

export const DETALLE_CUPON: DetalleCupon = {
  ...CUPON,
  resumenCanjes: { aceptados: 40, rechazados: 3, bonoOtorgado: '400.00' },
};

export const MIS_BONOS: MisBonos = {
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

export const ALERTA: VistaAlerta = {
  id: '9c3f5e3a-4c6d-4e77-9f30-2c3d4e5f6071',
  regla: 'CUENTAS_DISPOSITIVO',
  severidad: 'ALTA',
  usuarioId: 'usuario-ana',
  evidencia: { dispositivo: 'disp-7f3a', cuentas: ['usuario-ana', 'usuario-beto'] },
  estado: 'ABIERTA',
  nota: null,
  resueltaPor: null,
  resueltaEn: null,
  creadaEn: '2026-12-03T14:20:00.000Z',
};
