import { crearTxFalso, type OpcionesTxFalso } from '../../test/dobles/tx-falso.js';
import {
  apuestaGratisDePrueba,
  bonoDePrueba,
  bonoDepositoDePrueba,
  cuponDePrueba,
} from '../../test/fabricas/promociones.js';
import type { Reloj } from '../comun/reloj.js';
import type { ActividadService, CuentasRelacionadas } from '../fraude/actividad.service.js';
import type { RegistroAlertasService } from '../fraude/registro-alertas.service.js';
import type { Cupon } from '../generated/prisma/client.js';
import { CanjeService, type SolicitudCanje } from './canje.service.js';

const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };
const SIN_RELACIONES: CuentasRelacionadas = {
  dispositivos: ['disp-1'],
  porDispositivo: [],
  porMetodoPago: [],
};
const EN_APUESTA: SolicitudCanje = { usuarioId: 'u-1', origen: 'APUESTA' };

function preparar(
  opciones: OpcionesTxFalso & {
    relacionadas?: CuentasRelacionadas;
    alertaAlta?: boolean;
  } = {},
) {
  const { falso, tx } = crearTxFalso(opciones);
  const actividad = {
    cuentasRelacionadas: vi.fn().mockResolvedValue(opciones.relacionadas ?? SIN_RELACIONES),
  };
  const alertas = {
    tieneAlertaAltaVigente: vi.fn().mockResolvedValue(opciones.alertaAlta ?? false),
    registrar: vi.fn().mockResolvedValue(true),
  };
  const servicio = new CanjeService(
    actividad as unknown as ActividadService,
    alertas as unknown as RegistroAlertasService,
    reloj,
  );
  return { falso, tx, actividad, alertas, servicio };
}

async function evaluar(cupon: Cupon, opciones: Parameters<typeof preparar>[0] = {}) {
  const contexto = preparar({ cupon, ...opciones });
  const motivo = await contexto.servicio.motivoDelUsuario(contexto.tx, cupon, EN_APUESTA, {
    alertar: true,
  });
  return { ...contexto, motivo };
}

describe('CanjeService.motivoDelUsuario', () => {
  it('acepta a un usuario sin canjes previos, sin bono activo ni relaciones', async () => {
    const { motivo, falso } = await evaluar(apuestaGratisDePrueba());

    expect(motivo).toBeNull();
    expect(falso.canjeCupon.count).toHaveBeenCalledWith({
      where: { cuponId: apuestaGratisDePrueba().id, usuarioId: 'u-1', estado: 'ACEPTADO' },
    });
  });

  it('rechaza la reutilización cuando el usuario alcanzó su límite (LIMITE_USUARIO)', async () => {
    const { motivo } = await evaluar(cuponDePrueba({ limitePorUsuario: 2 }), {
      aceptadosDelUsuario: 2,
    });

    expect(motivo).toBe('LIMITE_USUARIO');
  });

  it('rechaza apilar bonos (BONO_ACTIVO) tras vencer de forma perezosa los bonos vencidos', async () => {
    const { motivo, falso } = await evaluar(apuestaGratisDePrueba(), {
      bonoActivo: bonoDePrueba(),
    });

    expect(motivo).toBe('BONO_ACTIVO');
    expect(falso.bono.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u-1', estado: 'ACTIVO', venceEn: { lte: AHORA } },
      data: { estado: 'VENCIDO' },
    });
  });

  it('serializa los canjes que otorgan bono de un mismo usuario con un bloqueo de la transacción', async () => {
    const { falso } = await evaluar(apuestaGratisDePrueba());

    expect(falso.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('el aumento de cuota se puede usar con un bono activo (no otorga bono)', async () => {
    const { motivo, falso } = await evaluar(cuponDePrueba(), { bonoActivo: bonoDePrueba() });

    expect(motivo).toBeNull();
    expect(falso.bono.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza cupones de bono a un usuario con alerta alta (USUARIO_EN_REVISION)', async () => {
    const { motivo, alertas, tx } = await evaluar(bonoDepositoDePrueba(), { alertaAlta: true });

    expect(motivo).toBe('USUARIO_EN_REVISION');
    expect(alertas.tieneAlertaAltaVigente).toHaveBeenCalledWith('u-1', tx);
  });

  it('rechaza el cupón ya usado por otra cuenta del mismo dispositivo y alerta fuera del tx', async () => {
    const cupon = apuestaGratisDePrueba();

    const { motivo, alertas, falso } = await evaluar(cupon, {
      relacionadas: { dispositivos: ['disp-1'], porDispositivo: ['u-2'], porMetodoPago: [] },
      canjeDeOtraCuenta: { usuarioId: 'u-2' },
    });

    expect(motivo).toBe('CUENTA_MULTIPLE');
    expect(falso.canjeCupon.findFirst).toHaveBeenCalledWith({
      where: {
        cuponId: cupon.id,
        estado: 'ACEPTADO',
        usuarioId: { not: 'u-1' },
        OR: [{ usuarioId: { in: ['u-2'] } }],
      },
      select: { usuarioId: true },
    });
    expect(alertas.registrar).toHaveBeenCalledWith({
      regla: 'CUPON_CUENTA_MULTIPLE',
      severidad: 'ALTA',
      usuarioId: 'u-1',
      claveDeduplicacion: `cupon:u-1:${cupon.id}`,
      evidencia: expect.objectContaining({
        cuponId: cupon.id,
        codigo: cupon.codigo,
        cuentas: ['u-1', 'u-2'],
        dispositivos: ['disp-1'],
      }),
    });
  });

  it('no alerta si se pide solo evaluar (vista previa)', async () => {
    const cupon = apuestaGratisDePrueba();
    const contexto = preparar({
      cupon,
      relacionadas: { dispositivos: ['disp-1'], porDispositivo: ['u-2'], porMetodoPago: [] },
      canjeDeOtraCuenta: { usuarioId: 'u-2' },
    });

    const motivo = await contexto.servicio.motivoDelUsuario(contexto.tx, cupon, EN_APUESTA, {
      alertar: false,
    });

    expect(motivo).toBe('CUENTA_MULTIPLE');
    expect(contexto.alertas.registrar).not.toHaveBeenCalled();
  });

  it('acepta si la cuenta relacionada nunca usó este cupón', async () => {
    const { motivo } = await evaluar(apuestaGratisDePrueba(), {
      relacionadas: { dispositivos: ['disp-1'], porDispositivo: ['u-2'], porMetodoPago: [] },
      canjeDeOtraCuenta: null,
    });

    expect(motivo).toBeNull();
  });

  it('en depósitos también compara el método de pago', async () => {
    const cupon = bonoDepositoDePrueba();
    const contexto = preparar({
      cupon,
      relacionadas: { dispositivos: [], porDispositivo: [], porMetodoPago: ['u-3'] },
      canjeDeOtraCuenta: { usuarioId: 'u-3' },
    });

    const motivo = await contexto.servicio.motivoDelUsuario(
      contexto.tx,
      cupon,
      { usuarioId: 'u-1', origen: 'DEPOSITO', referenciaId: 'dep-1', metodoPagoHuella: 'h-1' },
      { alertar: true },
    );

    expect(motivo).toBe('CUENTA_MULTIPLE');
    expect(contexto.actividad.cuentasRelacionadas).toHaveBeenCalledWith(
      'u-1',
      { metodoPagoHuella: 'h-1' },
      contexto.tx,
    );
    expect(contexto.falso.canjeCupon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ usuarioId: { in: ['u-3'] } }, { metodoPagoHuella: 'h-1' }],
        }),
      }),
    );
  });

  it('una falla al registrar la alerta no cambia el rechazo', async () => {
    const cupon = apuestaGratisDePrueba();
    const contexto = preparar({
      cupon,
      relacionadas: { dispositivos: ['disp-1'], porDispositivo: ['u-2'], porMetodoPago: [] },
      canjeDeOtraCuenta: { usuarioId: 'u-2' },
    });
    contexto.alertas.registrar.mockRejectedValue(new Error('sin conexión'));

    await expect(
      contexto.servicio.motivoDelUsuario(contexto.tx, cupon, EN_APUESTA, { alertar: true }),
    ).resolves.toBe('CUENTA_MULTIPLE');
  });
});

describe('CanjeService.registrarAceptado y registrarRechazado', () => {
  it('guarda el n-ésimo canje aceptado del usuario e incrementa los canjes del cupón', async () => {
    const cupon = cuponDePrueba({ limitePorUsuario: 3 });
    const { servicio, tx, falso } = preparar({ cupon, aceptadosDelUsuario: 1 });

    const canje = await servicio.registrarAceptado(tx, cupon, EN_APUESTA);

    expect(falso.canjeCupon.create).toHaveBeenCalledWith({
      data: {
        cuponId: cupon.id,
        codigo: cupon.codigo,
        usuarioId: 'u-1',
        origen: 'APUESTA',
        referenciaId: null,
        metodoPagoHuella: null,
        estado: 'ACEPTADO',
        numero: 2,
      },
    });
    expect(canje.numero).toBe(2);
    expect(falso.cupon.update).toHaveBeenCalledWith({
      where: { id: cupon.id },
      data: { canjes: { increment: 1 } },
    });
  });

  it('guarda un rechazo de depósito con su motivo, aun sin cupón', async () => {
    const { servicio, tx, falso } = preparar();

    await servicio.registrarRechazado(
      tx,
      { codigo: 'NOEXISTE', cupon: null },
      { usuarioId: 'u-1', origen: 'DEPOSITO', referenciaId: 'dep-1', metodoPagoHuella: 'h-1' },
      'CUPON_INEXISTENTE',
    );

    expect(falso.canjeCupon.create).toHaveBeenCalledWith({
      data: {
        cuponId: null,
        codigo: 'NOEXISTE',
        usuarioId: 'u-1',
        origen: 'DEPOSITO',
        referenciaId: 'dep-1',
        metodoPagoHuella: 'h-1',
        estado: 'RECHAZADO',
        motivo: 'CUPON_INEXISTENTE',
      },
    });
  });
});
