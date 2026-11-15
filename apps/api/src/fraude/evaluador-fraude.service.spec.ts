import { CONFIG_FRAUDE } from '../../test/fabricas/fraude.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EntradaActividad } from './actividad.mapeo.js';
import type { ActividadService } from './actividad.service.js';
import { EvaluadorFraudeService } from './evaluador-fraude.service.js';
import type { RegistroAlertasService } from './registro-alertas.service.js';
import * as apuestas from './reglas/apuestas.js';
import * as cuentas from './reglas/cuentas-multiples.js';

vi.mock('./reglas/cuentas-multiples.js');
vi.mock('./reglas/apuestas.js');

const AHORA = new Date('2026-11-15T12:00:00Z');

function crear() {
  return new EvaluadorFraudeService(
    {} as PrismaService,
    {} as ActividadService,
    {} as RegistroAlertasService,
    CONFIG_FRAUDE as never,
    { ahora: () => AHORA },
  );
}

const entrada = (tipo: EntradaActividad['tipo']): EntradaActividad => ({
  usuarioId: 'u-1',
  tipo,
  referenciaId: 'ref-1',
});

describe('EvaluadorFraudeService.evaluar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un registro evalúa dispositivo e IP', async () => {
    await crear().evaluar(entrada('REGISTRO'));

    expect(cuentas.evaluarCuentasPorDispositivo).toHaveBeenCalledOnce();
    expect(cuentas.evaluarCuentasPorIp).toHaveBeenCalledOnce();
    expect(apuestas.evaluarRafaga).not.toHaveBeenCalled();
  });

  it('un depósito evalúa el método de pago compartido', async () => {
    await crear().evaluar(entrada('DEPOSITO'));

    expect(cuentas.evaluarMetodoPagoCompartido).toHaveBeenCalledOnce();
  });

  it('una apuesta aceptada evalúa monto y ráfaga con la hora del reloj', async () => {
    await crear().evaluar(entrada('APUESTA_ACEPTADA'));

    expect(apuestas.evaluarMontoAnomalo).toHaveBeenCalledOnce();
    expect(apuestas.evaluarRafaga).toHaveBeenCalledOnce();
    const contexto = vi.mocked(apuestas.evaluarRafaga).mock.calls[0]?.[0];
    expect(contexto?.ahora).toEqual(AHORA);
  });

  it('retiros y liquidaciones no disparan reglas', async () => {
    await crear().evaluar(entrada('RETIRO'));
    await crear().evaluar(entrada('APUESTA_LIQUIDADA'));

    expect(cuentas.evaluarCuentasPorIp).not.toHaveBeenCalled();
    expect(apuestas.evaluarMontoAnomalo).not.toHaveBeenCalled();
  });

  it('si una regla falla, las demás se siguen evaluando y el error se propaga al final', async () => {
    vi.mocked(cuentas.evaluarCuentasPorDispositivo).mockRejectedValueOnce(new Error('falló'));

    await expect(crear().evaluar(entrada('REGISTRO'))).rejects.toThrow('falló');

    expect(cuentas.evaluarCuentasPorIp).toHaveBeenCalledOnce();
  });
});
