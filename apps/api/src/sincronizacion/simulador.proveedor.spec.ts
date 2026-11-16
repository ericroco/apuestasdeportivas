import { BadRequestException } from '@nestjs/common';
import { SimuladorProveedor, traducirEventoSimulado } from './simulador.proveedor.js';

const EN_VIVO = { estado: 'EN_VIVO' as const, golesLocal: 1, golesVisitante: 0, minuto: 30 };

describe('traducirEventoSimulado', () => {
  it('INICIO pone el partido en vivo con 0-0 en el minuto 0', () => {
    const programado = {
      estado: 'PROGRAMADO' as const,
      golesLocal: null,
      golesVisitante: null,
      minuto: null,
    };

    expect(traducirEventoSimulado(programado, { tipo: 'INICIO' })).toEqual({
      estado: 'EN_VIVO',
      golesLocal: 0,
      golesVisitante: 0,
      minuto: 0,
      motivo: 'simulación: INICIO',
    });
  });

  it('GOL suma un gol al equipo indicado y respeta el minuto', () => {
    expect(
      traducirEventoSimulado(EN_VIVO, { tipo: 'GOL', equipo: 'VISITANTE', minuto: 55 }),
    ).toEqual({
      golesLocal: 1,
      golesVisitante: 1,
      minuto: 55,
      motivo: 'simulación: GOL',
    });
  });

  it('GOL sin equipo es un error de la petición', () => {
    expect(() => traducirEventoSimulado(EN_VIVO, { tipo: 'GOL' })).toThrow(BadRequestException);
  });

  it.each([
    ['SUSPENSION', 'SUSPENDIDO'],
    ['REANUDACION', 'EN_VIVO'],
    ['APLAZAMIENTO', 'APLAZADO'],
    ['FINAL', 'FINALIZADO'],
    ['CANCELACION', 'CANCELADO'],
  ] as const)('%s lleva el partido a %s', (tipo, estado) => {
    expect(traducirEventoSimulado(EN_VIVO, { tipo })).toMatchObject({ estado });
  });
});

describe('SimuladorProveedor', () => {
  it('no consulta ninguna red: devuelve listas vacías', async () => {
    const simulador = new SimuladorProveedor();

    expect(simulador.esSimulacion).toBe(true);
    await expect(simulador.partidosDelDia('2026-11-15')).resolves.toEqual([]);
    await expect(simulador.partidosEnVivo()).resolves.toEqual([]);
    await expect(simulador.partidosPorId([1])).resolves.toEqual([]);
    await expect(simulador.cuotasDePartido(1001)).resolves.toBeNull();
  });
});
