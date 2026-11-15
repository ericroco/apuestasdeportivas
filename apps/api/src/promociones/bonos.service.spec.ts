import { AuditoriaEnMemoria } from '../../test/dobles/auditoria-en-memoria.js';
import { BilleteraEnMemoria } from '../../test/dobles/billetera-en-memoria.js';
import { crearTxFalso, type OpcionesTxFalso } from '../../test/dobles/tx-falso.js';
import {
  apuestaGratisDePrueba,
  bonoDePrueba,
  bonoDepositoDePrueba,
} from '../../test/fabricas/promociones.js';
import { DependenciaNoDisponibleError } from '../comun/dependencias.js';
import type { Reloj } from '../comun/reloj.js';
import { validarEntorno } from '../config/env.js';
import type { ActividadService } from '../fraude/actividad.service.js';
import type { RegistroAlertasService } from '../fraude/registro-alertas.service.js';
import { Prisma, type Cupon } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BonosService, type DepositoParaBono } from './bonos.service.js';
import { CanjeService } from './canje.service.js';
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
  cupon: Cupon | null,
  opciones: OpcionesTxFalso & { conBilletera?: boolean; fallaTransaccion?: unknown } = {},
) {
  const { falso, tx } = crearTxFalso({ cupon, ...opciones });
  const prisma = {
    $transaction: vi.fn(async (trabajo: (cliente: unknown) => Promise<unknown>) => {
      if (opciones.fallaTransaccion) throw opciones.fallaTransaccion;
      return trabajo(tx);
    }),
  };
  const actividad = {
    cuentasRelacionadas: vi
      .fn()
      .mockResolvedValue({ dispositivos: [], porDispositivo: [], porMetodoPago: [] }),
  };
  const alertas = { tieneAlertaAltaVigente: vi.fn().mockResolvedValue(false), registrar: vi.fn() };
  const canje = new CanjeService(
    actividad as unknown as ActividadService,
    alertas as unknown as RegistroAlertasService,
    undefined,
    reloj,
  );
  const billetera = (opciones.conBilletera ?? true) ? new BilleteraEnMemoria() : undefined;
  const auditoria = new AuditoriaEnMemoria();
  const servicio = new BonosService(
    prisma as unknown as PrismaService,
    canje,
    ENTORNO,
    billetera,
    auditoria,
    reloj,
  );
  return { servicio, falso, prisma, billetera, auditoria };
}

const deposito = (
  monto: string,
  codigoCupon: string | null = 'BIENVENIDA10',
): DepositoParaBono => ({
  usuarioId: 'u-1',
  depositoId: 'dep-1',
  monto: d(monto),
  codigoCupon,
  metodoPagoHuella: 'h-1',
});

describe('BonosService.otorgarPorDeposito', () => {
  it('100 % con tope 10.00 sobre un depósito de 20.00 otorga 10.00 con requisito 50.00', async () => {
    const cupon = bonoDepositoDePrueba();
    const { servicio, falso, billetera, auditoria } = preparar(cupon);

    const resultado = await servicio.otorgarPorDeposito(deposito('20.00'));

    expect(resultado).toBe('OTORGADO');
    expect(falso.canjeCupon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        estado: 'ACEPTADO',
        origen: 'DEPOSITO',
        referenciaId: 'dep-1',
        metodoPagoHuella: 'h-1',
        numero: 1,
      }),
    });
    expect(falso.bono.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monto: d('10'), requisito: d('50') }),
    });
    expect(billetera?.asientos).toEqual([
      expect.objectContaining({
        operacion: 'BONO',
        monto: d('10'),
        claveIdempotencia: `cupon:${cupon.id}:u-1:1:bono`,
      }),
    ]);
    expect(auditoria.eventos[0]?.evento).toMatchObject({ accion: 'bono.otorgado', actorId: null });
  });

  it('un depósito por debajo del mínimo guarda el canje rechazado y no otorga bono', async () => {
    const { servicio, falso, billetera } = preparar(bonoDepositoDePrueba());

    expect(await servicio.otorgarPorDeposito(deposito('5.00'))).toBe('DEPOSITO_INSUFICIENTE');
    expect(falso.canjeCupon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estado: 'RECHAZADO', motivo: 'DEPOSITO_INSUFICIENTE' }),
    });
    expect(falso.bono.create).not.toHaveBeenCalled();
    expect(billetera?.asientos).toHaveLength(0);
  });

  it('un código inexistente guarda el rechazo sin cupón', async () => {
    const { servicio, falso } = preparar(null);

    expect(await servicio.otorgarPorDeposito(deposito('20', ' no existe '))).toBe(
      'CUPON_INEXISTENTE',
    );
    expect(falso.canjeCupon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cuponId: null, codigo: 'NOEXISTE', estado: 'RECHAZADO' }),
    });
  });

  it('un depósito sin código no abre transacción', async () => {
    const { servicio, prisma } = preparar(bonoDepositoDePrueba());

    expect(await servicio.otorgarPorDeposito(deposito('20', null))).toBe('SIN_CUPON');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('el mismo depósito recibido otra vez no vuelve a canjear (idempotencia)', async () => {
    const { servicio, falso, billetera } = preparar(bonoDepositoDePrueba(), {
      canjeDelDeposito: { id: 'canje-previo' },
    });

    expect(await servicio.otorgarPorDeposito(deposito('20'))).toBe('YA_PROCESADO');
    expect(falso.canjeCupon.findUnique).toHaveBeenCalledWith({
      where: { origen_referenciaId: { origen: 'DEPOSITO', referenciaId: 'dep-1' } },
    });
    expect(falso.canjeCupon.create).not.toHaveBeenCalled();
    expect(billetera?.asientos).toHaveLength(0);
  });

  it('si dos procesos del mismo depósito chocan en la restricción única, cuenta como ya procesado', async () => {
    const { servicio } = preparar(bonoDepositoDePrueba(), {
      fallaTransaccion: new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    });

    expect(await servicio.otorgarPorDeposito(deposito('20'))).toBe('YA_PROCESADO');
  });

  it('rechaza el bono si el usuario ya tiene uno activo (bono apilado)', async () => {
    const { servicio, falso } = preparar(bonoDepositoDePrueba(), { bonoActivo: bonoDePrueba() });

    expect(await servicio.otorgarPorDeposito(deposito('20'))).toBe('BONO_ACTIVO');
    expect(falso.bono.create).not.toHaveBeenCalled();
  });

  it('una apuesta gratis no se puede usar al depositar', async () => {
    const { servicio } = preparar(apuestaGratisDePrueba());

    expect(await servicio.otorgarPorDeposito(deposito('20', 'GRATIS5'))).toBe('TIPO_NO_APLICA');
  });

  it('sin billetera falla con 503 antes de abrir la transacción', async () => {
    const { servicio, prisma } = preparar(bonoDepositoDePrueba(), { conBilletera: false });

    await expect(servicio.otorgarPorDeposito(deposito('20'))).rejects.toThrow(
      DependenciaNoDisponibleError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
