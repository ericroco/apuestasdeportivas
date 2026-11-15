import type {
  DesgloseCompeticiones,
  ResumenReporte,
  SerieDiaria,
} from '@/lib/servidor/esquemas-reportes';

/** Datos de prueba que cumplen contracts/reportes.md §2. */

export const RESUMEN: ResumenReporte = {
  apuestas: {
    cantidad: 1520,
    volumen: '15200.00',
    premiosPagados: '13100.00',
    ggr: '1850.00',
    usuariosActivos: 87,
  },
  depositos: { cantidad: 210, monto: '21000.00' },
  retiros: { cantidad: 45, monto: '6400.00' },
  cupones: { canjesAceptados: 60, canjesRechazados: 7, bonoOtorgado: '540.00' },
  alertas: { abiertas: 4, confirmadas: 2, descartadas: 5, altas: 6, medias: 5 },
  generadoEn: '2027-01-02T10:00:00Z',
};

export const RESUMEN_VACIO: ResumenReporte = {
  apuestas: {
    cantidad: 0,
    volumen: '0.00',
    premiosPagados: '0.00',
    ggr: '0.00',
    usuariosActivos: 0,
  },
  depositos: { cantidad: 0, monto: '0.00' },
  retiros: { cantidad: 0, monto: '0.00' },
  cupones: { canjesAceptados: 0, canjesRechazados: 0, bonoOtorgado: '0.00' },
  alertas: { abiertas: 0, confirmadas: 0, descartadas: 0, altas: 0, medias: 0 },
  generadoEn: '2027-01-02T10:00:00Z',
};

export const SERIE: SerieDiaria = {
  dias: [
    {
      fecha: '2026-12-01',
      volumen: '500.00',
      premiosPagados: '430.00',
      ggr: '70.00',
      apuestas: 48,
      depositos: '800.00',
      retiros: '100.00',
    },
    {
      fecha: '2026-12-02',
      volumen: '0.00',
      premiosPagados: '0.00',
      ggr: '0.00',
      apuestas: 0,
      depositos: '0.00',
      retiros: '0.00',
    },
    {
      fecha: '2026-12-03',
      volumen: '1250.50',
      premiosPagados: '1300.00',
      ggr: '-49.50',
      apuestas: 120,
      depositos: '300.00',
      retiros: '0.00',
    },
  ],
};

export const COMPETICIONES: DesgloseCompeticiones = {
  competiciones: [
    {
      competicionId: '0b6f7a1c-1d2e-4f30-8a4b-5c6d7e8f9a0b',
      nombre: 'LigaPro',
      deporte: 'futbol',
      apuestas: 300,
      volumen: '3000.00',
      ggr: '250.00',
    },
    {
      competicionId: '1c7a8b2d-2e3f-4a41-9b5c-6d7e8f9a0b1c',
      nombre: '=Copa "Libertadores"',
      deporte: 'futbol',
      apuestas: 120,
      volumen: '1500.00',
      ggr: '-20.00',
    },
  ],
};
