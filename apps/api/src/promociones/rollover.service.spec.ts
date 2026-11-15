import { AuditoriaEnMemoria } from '../../test/dobles/auditoria-en-memoria.js';
import { BilleteraEnMemoria } from '../../test/dobles/billetera-en-memoria.js';
import { crearTxFalso } from '../../test/dobles/tx-falso.js';
import { bonoDePrueba } from '../../test/fabricas/promociones.js';
import { DependenciaNoDisponibleError } from '../comun/dependencias.js';
import type { Reloj } from '../comun/reloj.js';
import { validarEntorno } from '../config/env.js';
import { Prisma, type Bono } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BonosService } from './bonos.service.js';
import type { CanjeService } from './canje.service.js';
import { RolloverService } from './rollover.service.js';
import { VARIABLES_SPEC2_DE_PRUEBA } from '../../test/ayudas/entorno-de-prueba.js';

const d = (valor: string) => new Prisma.Decimal(valor);
const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };
const ENTORNO = validarEntorno({
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  ...VARIABLES_SPEC2_DE_PRUEBA,
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:3000',
});

function preparar(
  bono: Bono | null,
  sumaQueCuenta: string,
  opciones: { saldoBono?: string; conBilletera?: boolean; pendientes?: boolean } = {},
) {
  const { falso, tx } = crearTxFalso({ bonoActivo: bono });
  falso.$queryRaw
    .mockReset()
    .mockResolvedValueOnce(bono ? [{ id: bono.id }] : [])
    .mockResolvedValueOnce([{ total: sumaQueCuenta }])
    .mockResolvedValueOnce([{ pendiente: opciones.pendientes ?? false }]);
  const prisma = { $transaction: vi.fn(async (trabajo: (t: unknown) => unknown) => trabajo(tx)) };
  const billetera = (opciones.conBilletera ?? true) ? new BilleteraEnMemoria() : undefined;
  billetera?.fijarSaldos('apostador-1', { real: '3.00', bono: opciones.saldoBono ?? '10.00' });
  const auditoria = new AuditoriaEnMemoria();
  const bonos = new BonosService(
    {} as PrismaService,
    {} as CanjeService,
    ENTORNO,
    billetera,
    auditoria,
    reloj,
  );
  const servicio = new RolloverService(prisma as unknown as PrismaService, bonos, ENTORNO, reloj);
  return { servicio, falso, billetera, auditoria };
}

describe('RolloverService.recalcular', () => {
  it('sin bono activo no hace nada', async () => {
    const { servicio, falso } = preparar(null, '0');

    expect(await servicio.recalcular('apostador-1')).toBe('SIN_BONO');
    expect(falso.bono.update).not.toHaveBeenCalled();
  });

  it('vence de forma perezosa antes de bloquear el bono activo', async () => {
    const { servicio, falso } = preparar(null, '0');

    await servicio.recalcular('apostador-1');

    const [consulta, ...valores] = falso.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    const sql = consulta.join('?');
    expect(sql).toMatch(/SET estado = 'VENCIDO'/);
    expect(sql).toMatch(/vence_en <= \?/);
    expect(valores).toEqual(['apostador-1', AHORA]);
    expect(falso.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      falso.$queryRaw.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('un bono que ya alcanzó el requisito no vence mientras espera liquidaciones', async () => {
    const { servicio, falso } = preparar(null, '0');

    await servicio.recalcular('apostador-1');

    const [consulta] = falso.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    expect(consulta.join('?')).toMatch(/avance < requisito/);
  });

  it('suma solo apuestas ganadas o perdidas, aceptadas tras el bono y con cuota mínima', async () => {
    const bono = bonoDePrueba();
    const { servicio, falso } = preparar(bono, '0');

    await servicio.recalcular('apostador-1');

    const [consulta, ...valores] = falso.$queryRaw.mock.calls[1] as [TemplateStringsArray];
    const sql = consulta.join('?');
    expect(sql).toMatch(/'GANADA', 'PERDIDA'/);
    expect(sql).toMatch(/a\.ocurrido_en >= \?/);
    expect(sql).toMatch(/a\.cuota IS NOT NULL AND a\.cuota >= \?::numeric/);
    expect(valores).toEqual(['apostador-1', bono.otorgadoEn, bono.venceEn, '1.50']);
  });

  it('guarda el avance cuando crece sin alcanzar el requisito', async () => {
    const { servicio, falso, billetera } = preparar(bonoDePrueba(), '20.00');

    expect(await servicio.recalcular('apostador-1')).toBe('EN_CURSO');
    expect(falso.bono.update).toHaveBeenCalledWith({
      where: { id: bonoDePrueba().id },
      data: { avance: d('20') },
    });
    expect(billetera?.asientos).toHaveLength(0);
  });

  it('el avance solo crece', async () => {
    const { servicio, falso } = preparar(bonoDePrueba({ avance: d('12') }), '5.00');

    expect(await servicio.recalcular('apostador-1')).toBe('EN_CURSO');
    expect(falso.bono.update).not.toHaveBeenCalled();
  });

  it('al cumplir convierte TODO el saldo de bono una sola vez y audita bono.convertido', async () => {
    const bono = bonoDePrueba();
    const { servicio, falso, billetera, auditoria } = preparar(bono, '50.00', {
      saldoBono: '7.30',
    });

    expect(await servicio.recalcular('apostador-1')).toBe('CUMPLIDO');
    expect(billetera?.asientos).toEqual([
      expect.objectContaining({
        operacion: 'CONVERSION',
        monto: d('7.30'),
        claveIdempotencia: `bono:${bono.id}:conversion`,
        referencia: bono.cuponId,
      }),
    ]);
    expect(falso.bono.update).toHaveBeenCalledWith({
      where: { id: bono.id },
      data: { estado: 'CUMPLIDO', avance: d('50'), cumplidoEn: AHORA, montoConvertido: d('7.30') },
    });
    expect(auditoria.eventos).toEqual([
      {
        enTransaccion: true,
        evento: expect.objectContaining({ accion: 'bono.convertido', entidadId: bono.id }),
      },
    ]);
    expect((await billetera?.obtenerSaldos('apostador-1'))?.real.toFixed(2)).toBe('10.30');
  });

  it('con saldo de bono en cero queda cumplido sin mover dinero', async () => {
    const { servicio, falso, billetera } = preparar(bonoDePrueba(), '60.00', { saldoBono: '0' });

    expect(await servicio.recalcular('apostador-1')).toBe('CUMPLIDO');
    expect(billetera?.asientos).toHaveLength(0);
    expect(falso.bono.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'CUMPLIDO', montoConvertido: d('0') }),
      }),
    );
  });

  it('con apuestas pagadas con saldo de bono sin liquidar no convierte y el bono sigue activo', async () => {
    const { servicio, falso, billetera, auditoria } = preparar(bonoDePrueba(), '50.00', {
      pendientes: true,
      saldoBono: '100.00',
    });

    expect(await servicio.recalcular('apostador-1')).toBe('EN_CURSO');
    expect(billetera?.asientos).toHaveLength(0);
    expect(auditoria.eventos).toHaveLength(0);
    expect(falso.bono.update).toHaveBeenCalledTimes(1);
    expect(falso.bono.update).toHaveBeenCalledWith({
      where: { id: bonoDePrueba().id },
      data: { avance: d('50') },
    });
    const [consulta, ...valores] = falso.$queryRaw.mock.calls[2] as [TemplateStringsArray];
    const sql = consulta.join('?');
    expect(sql).toMatch(/a\.tipo = 'APUESTA_ACEPTADA' AND a\.tipo_saldo = 'BONO'/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(valores).toEqual(['apostador-1']);
  });

  it('con el avance ya guardado y pendientes no repite la escritura', async () => {
    const { servicio, falso } = preparar(bonoDePrueba({ avance: d('50') }), '50.00', {
      pendientes: true,
    });

    expect(await servicio.recalcular('apostador-1')).toBe('EN_CURSO');
    expect(falso.bono.update).not.toHaveBeenCalled();
  });

  it('sin la billetera del Spec 2 no se cumple el bono (503) y la transacción se revierte', async () => {
    const { servicio } = preparar(bonoDePrueba(), '50.00', { conBilletera: false });

    await expect(servicio.recalcular('apostador-1')).rejects.toThrow(DependenciaNoDisponibleError);
  });
});
