import { AuditoriaEnMemoria } from '../../test/dobles/auditoria-en-memoria.js';
import { BilleteraEnMemoria } from '../../test/dobles/billetera-en-memoria.js';
import { crearTxFalso, type OpcionesTxFalso } from '../../test/dobles/tx-falso.js';
import {
  apuestaGratisDePrueba,
  bonoDepositoDePrueba,
  cuponDePrueba,
} from '../../test/fabricas/promociones.js';
import { DependenciaNoDisponibleError } from '../comun/dependencias.js';
import type { Reloj } from '../comun/reloj.js';
import { validarEntorno } from '../config/env.js';
import { CuponInvalidoError } from '../contracts/promociones.port.js';
import type { ActividadService } from '../fraude/actividad.service.js';
import type { RegistroAlertasService } from '../fraude/registro-alertas.service.js';
import { Prisma, type Cupon } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BonosService } from './bonos.service.js';
import { CanjeService } from './canje.service.js';
import { PromocionesApuestaAdapter } from './promociones-apuesta.adapter.js';

const d = (valor: string) => new Prisma.Decimal(valor);
const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };
const ENTORNO = validarEntorno({
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:3000',
});

function preparar(
  cupon: Cupon | null,
  opciones: OpcionesTxFalso & { conBilletera?: boolean } = {},
) {
  const { falso, tx } = crearTxFalso({ cupon, ...opciones });
  const actividad = {
    cuentasRelacionadas: vi
      .fn()
      .mockResolvedValue({ dispositivos: [], porDispositivo: [], porMetodoPago: [] }),
  };
  const alertas = {
    tieneAlertaAltaVigente: vi.fn().mockResolvedValue(false),
    registrar: vi.fn(),
  };
  const canje = new CanjeService(
    actividad as unknown as ActividadService,
    alertas as unknown as RegistroAlertasService,
    undefined,
    reloj,
  );
  const billetera = (opciones.conBilletera ?? true) ? new BilleteraEnMemoria() : undefined;
  const auditoria = new AuditoriaEnMemoria();
  const bonos = new BonosService({} as PrismaService, canje, ENTORNO, billetera, auditoria, reloj);
  const adaptador = new PromocionesApuestaAdapter(canje, bonos, reloj);
  return { falso, tx, billetera, auditoria, adaptador };
}

const solicitud = (codigoCupon: string, monto: string, cuotaTotal = '2.00') => ({
  usuarioId: 'u-1',
  codigoCupon,
  monto: d(monto),
  cuotaTotal: d(cuotaTotal),
});

async function motivoDeRechazo(promesa: Promise<unknown>): Promise<string | undefined> {
  const error: unknown = await promesa.then(
    () => undefined,
    (motivo: unknown) => motivo,
  );
  if (!(error instanceof CuponInvalidoError)) throw error;
  return error.message;
}

describe('PromocionesApuestaAdapter.aplicarAApuesta: aumento de cuota', () => {
  it('un aumento del 10 % sobre cuota 2.00 congela 2.20 y suma un canje', async () => {
    const cupon = cuponDePrueba();
    const { adaptador, tx, falso } = preparar(cupon);

    const efecto = await adaptador.aplicarAApuesta(tx, solicitud(' cuota10 ', '10'));

    expect(efecto).toEqual({ cuponId: cupon.id, tipoSaldo: 'REAL', cuotaFinal: d('2.20') });
    expect(falso.$queryRaw.mock.calls[0]?.slice(1)).toEqual(['CUOTA10']);
    expect(falso.canjeCupon.create).toHaveBeenCalled();
    expect(falso.cupon.update).toHaveBeenCalledWith({
      where: { id: cupon.id },
      data: { canjes: { increment: 1 } },
    });
  });

  it('el mismo usuario no lo puede volver a usar: "Ya usaste este cupón."', async () => {
    const { adaptador, tx, falso } = preparar(cuponDePrueba(), { aceptadosDelUsuario: 1 });

    expect(await motivoDeRechazo(adaptador.aplicarAApuesta(tx, solicitud('CUOTA10', '10')))).toBe(
      'Ya usaste este cupón.',
    );
    expect(falso.canjeCupon.create).not.toHaveBeenCalled();
  });

  it('funciona sin la billetera del Spec 2 (no mueve dinero)', async () => {
    const { adaptador, tx } = preparar(cuponDePrueba(), { conBilletera: false });

    await expect(adaptador.aplicarAApuesta(tx, solicitud('CUOTA10', '10'))).resolves.toMatchObject({
      tipoSaldo: 'REAL',
    });
  });
});

describe('PromocionesApuestaAdapter.aplicarAApuesta: apuesta gratis', () => {
  it('acredita como bono el monto apostado, crea el bono con su requisito y paga con BONO', async () => {
    const cupon = apuestaGratisDePrueba();
    const { adaptador, tx, falso, billetera, auditoria } = preparar(cupon);

    const efecto = await adaptador.aplicarAApuesta(tx, solicitud('GRATIS5', '5.00', '1.80'));

    expect(efecto).toEqual({ cuponId: cupon.id, tipoSaldo: 'BONO', cuotaFinal: d('1.80') });
    expect(billetera?.asientos).toEqual([
      expect.objectContaining({
        operacion: 'BONO',
        usuarioId: 'u-1',
        monto: d('5'),
        claveIdempotencia: `cupon:${cupon.id}:u-1:1:bono`,
        referencia: cupon.id,
      }),
    ]);
    expect(falso.bono.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: 'u-1',
        cuponId: cupon.id,
        canjeId: 'canje-1',
        monto: d('5'),
        requisito: d('25'),
        otorgadoEn: AHORA,
        venceEn: new Date('2026-12-15T12:00:00Z'),
      }),
    });
    expect(auditoria.eventos).toEqual([
      { enTransaccion: true, evento: expect.objectContaining({ accion: 'bono.otorgado' }) },
    ]);
  });

  it('rechaza un monto mayor que el del cupón sin escribir nada', async () => {
    const { adaptador, tx, falso, billetera } = preparar(apuestaGratisDePrueba());

    expect(await motivoDeRechazo(adaptador.aplicarAApuesta(tx, solicitud('GRATIS5', '8')))).toBe(
      'El monto supera el permitido por el cupón.',
    );
    expect(falso.canjeCupon.create).not.toHaveBeenCalled();
    expect(billetera?.asientos).toHaveLength(0);
  });

  it('sin la billetera del Spec 2 falla con 503 antes de consumir el cupón', async () => {
    const { adaptador, tx, falso } = preparar(apuestaGratisDePrueba(), { conBilletera: false });

    await expect(adaptador.aplicarAApuesta(tx, solicitud('GRATIS5', '5'))).rejects.toThrow(
      DependenciaNoDisponibleError,
    );
    expect(falso.canjeCupon.create).not.toHaveBeenCalled();
    expect(falso.bono.updateMany).not.toHaveBeenCalled();
  });
});

describe('PromocionesApuestaAdapter.aplicarAApuesta: cupones que no aplican', () => {
  it.each([
    [null, 'GRATIS5', 'El cupón no existe.'],
    [null, 'x!', 'El cupón no existe.'],
    [cuponDePrueba({ estado: 'PAUSADO' }), 'CUOTA10', 'El cupón está pausado.'],
    [cuponDePrueba({ terminaEn: AHORA }), 'CUOTA10', 'El cupón venció.'],
    [cuponDePrueba({ canjes: 10 }), 'CUOTA10', 'El cupón se agotó.'],
    [
      cuponDePrueba({ iniciaEn: new Date('2026-12-01T00:00:00Z') }),
      'CUOTA10',
      'El cupón todavía no está vigente.',
    ],
    [bonoDepositoDePrueba(), 'BIENVENIDA10', 'Este cupón no se puede usar en esta operación.'],
  ])('%#: rechaza con un motivo legible', async (cupon, codigo, mensaje) => {
    const { adaptador, tx, falso } = preparar(cupon);

    expect(await motivoDeRechazo(adaptador.aplicarAApuesta(tx, solicitud(codigo, '5')))).toBe(
      mensaje,
    );
    expect(falso.canjeCupon.create).not.toHaveBeenCalled();
  });

  it('no consulta la base con un código de formato inválido', async () => {
    const { adaptador, tx, falso } = preparar(null);

    await motivoDeRechazo(adaptador.aplicarAApuesta(tx, solicitud('x!', '5')));

    expect(falso.$queryRaw).not.toHaveBeenCalled();
  });

  it('rechaza una solicitud con monto o cuota inválidos del Spec 3', async () => {
    const { adaptador, tx } = preparar(cuponDePrueba());

    await expect(adaptador.aplicarAApuesta(tx, solicitud('CUOTA10', '0'))).rejects.toThrow(
      RangeError,
    );
    await expect(adaptador.aplicarAApuesta(tx, solicitud('CUOTA10', '5', '0.90'))).rejects.toThrow(
      RangeError,
    );
  });
});
