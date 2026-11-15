import request from 'supertest';
import type { ClienteTransaccional } from '../src/contracts/billetera.port.js';
import {
  PROMOCIONES_APUESTA_PORT,
  type PromocionesApuestaPort,
} from '../src/contracts/promociones.port.js';
import type { ApuestaAceptadaExtendida } from '../src/fraude/eventos-extendidos.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { comoUsuario } from './dobles/guard-de-prueba.js';
import {
  crearAppDePrueba,
  limpiarTablasSpec4,
  type AppDePrueba,
} from './utilidades/app-de-prueba.js';

// Saldo de bono "huérfano": el que no pertenece al bono que se convierte (revisión del Spec 4, hallazgo 1).
const d = (valor: string) => new Prisma.Decimal(valor);
const USUARIO = 'apostador-huerfano';
const MIOS = comoUsuario(USUARIO, 'APOSTADOR');
const VIGENCIA = {
  iniciaEn: new Date('2026-01-01T00:00:00Z'),
  terminaEn: new Date('2099-01-01T00:00:00Z'),
};
const OPCIONES_TX = { maxWait: 10_000, timeout: 10_000 };
/** La billetera en memoria ignora la transacción. */
const SIN_TX = null as unknown as ClienteTransaccional;

describe('Saldo de bono sin dueño (e2e)', () => {
  let contexto: AppDePrueba;
  let puerto: PromocionesApuestaPort;
  const http = () => request(contexto.app.getHttpServer());

  beforeAll(async () => {
    contexto = await crearAppDePrueba();
    puerto = contexto.app.get<PromocionesApuestaPort>(PROMOCIONES_APUESTA_PORT);
  });

  beforeEach(async () => {
    await limpiarTablasSpec4(contexto.prisma);
    contexto.billetera?.reiniciar();
    contexto.auditoria?.reiniciar();
    const comun = { cupoTotal: 100, creadoPor: 'operador-1', ...VIGENCIA };
    await contexto.prisma.cupon.createMany({
      data: [
        {
          ...comun,
          codigo: 'GRANDE100',
          tipo: 'BONO_DEPOSITO',
          porcentaje: d('100'),
          topeBono: d('100'),
          depositoMinimo: d('10'),
        },
        { ...comun, codigo: 'GRATIS1', tipo: 'APUESTA_GRATIS', montoFijo: d('1') },
        { ...comun, codigo: 'GRATIS5', tipo: 'APUESTA_GRATIS', montoFijo: d('5') },
        { ...comun, codigo: 'GRATIS2', tipo: 'APUESTA_GRATIS', montoFijo: d('2') },
      ],
    });
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  const aplicarGratis = (codigoCupon: string, monto: string, cuotaTotal = '2.00') =>
    contexto.prisma.$transaction(
      (tx) =>
        puerto.aplicarAApuesta(tx, {
          usuarioId: USUARIO,
          codigoCupon,
          monto: d(monto),
          cuotaTotal: d(cuotaTotal),
        }),
      OPCIONES_TX,
    );

  const aceptar = (apuestaId: string, monto: string, cuotaTotal: string, tipoSaldo = 'REAL') =>
    contexto.emitir('apuesta.aceptada', {
      usuarioId: USUARIO,
      apuestaId,
      monto,
      tipoSaldo,
      cuotaTotal,
    } as ApuestaAceptadaExtendida);

  const liquidar = (apuestaId: string, monto: string, resultado: 'GANADA' | 'PERDIDA') =>
    contexto.emitir('apuesta.liquidada', {
      usuarioId: USUARIO,
      apuestaId,
      monto,
      resultado,
      premio: resultado === 'GANADA' ? '100.00' : '0.00',
    });

  const conversiones = () =>
    contexto.billetera?.asientos.filter(
      (a) => a.usuarioId === USUARIO && a.operacion === 'CONVERSION',
    ) ?? [];

  const bonoUnico = () => contexto.prisma.bono.findFirstOrThrow({ where: { usuarioId: USUARIO } });

  it('(a) tras vencer un bono con saldo, una apuesta gratis nueva se rechaza y nada se convierte', async () => {
    await contexto.emitir('deposito.confirmado', {
      usuarioId: USUARIO,
      depositoId: 'dep-1',
      monto: '100.00',
      codigoCupon: 'GRANDE100',
    });
    expect((await contexto.billetera?.obtenerSaldos(USUARIO))?.bono.toFixed(2)).toBe('100.00');
    await contexto.prisma.bono.updateMany({
      where: { usuarioId: USUARIO },
      data: { venceEn: new Date('2026-01-03T00:00:00Z') },
    });

    const previa = await http().get('/api/cupones/vista-previa/GRATIS1').set(MIOS).expect(200);
    await expect(aplicarGratis('GRATIS1', '1.00')).rejects.toMatchObject({
      codigo: 'SALDO_BONO_PENDIENTE',
    });

    expect(previa.body).toMatchObject({
      puedeUsar: false,
      motivo: {
        codigo: 'SALDO_BONO_PENDIENTE',
        mensaje:
          'Tienes saldo de una promoción anterior; úsalo en apuestas antes de recibir otro bono.',
      },
    });
    expect((await bonoUnico()).estado).toBe('VENCIDO');
    expect(await contexto.prisma.bono.count({ where: { usuarioId: USUARIO } })).toBe(1);
    expect(conversiones()).toHaveLength(0);
    expect((await contexto.billetera?.obtenerSaldos(USUARIO))?.bono.toFixed(2)).toBe('100.00');
  });

  it('(b) con una apuesta gratis pendiente el bono no se cumple ni vence; convierte al liquidarse', async () => {
    await aplicarGratis('GRATIS5', '5.00', '20.00');
    await contexto.billetera?.debitarApuesta(SIN_TX, {
      usuarioId: USUARIO,
      apuestaId: 'ap-gratis',
      tipoSaldo: 'BONO',
      monto: d('5'),
      claveIdempotencia: 'debito-ap-gratis',
    });
    await aceptar('ap-gratis', '5.00', '20.00', 'BONO');
    await aceptar('ap-real', '25.00', '2.00');

    await liquidar('ap-real', '25.00', 'PERDIDA');

    const enEspera = await bonoUnico();
    expect(enEspera).toMatchObject({ estado: 'ACTIVO', montoConvertido: null });
    expect(enEspera.avance.toFixed(2)).toBe('25.00');
    expect(conversiones()).toHaveLength(0);

    // El requisito está cumplido: el vencimiento perezoso ya no lo toca mientras espera la liquidación.
    await contexto.prisma.bono.update({
      where: { id: enEspera.id },
      data: { venceEn: new Date('2026-01-03T00:00:00Z') },
    });
    const mios = await http().get('/api/bonos/mios').set(MIOS).expect(200);
    expect(mios.body.activo).toMatchObject({ estado: 'ACTIVO', avance: '25.00' });

    // La apuesta gratis gana 100.00 en saldo de bono: ahora sí se convierte, una sola vez.
    await contexto.billetera?.acreditarPremio(SIN_TX, {
      usuarioId: USUARIO,
      apuestaId: 'ap-gratis',
      tipoSaldo: 'BONO',
      monto: d('100'),
      claveIdempotencia: 'premio-ap-gratis',
    });
    await Promise.all(Array.from({ length: 3 }, () => liquidar('ap-gratis', '5.00', 'GANADA')));

    const cumplido = await bonoUnico();
    expect(cumplido.estado).toBe('CUMPLIDO');
    expect(cumplido.montoConvertido?.toFixed(2)).toBe('100.00');
    expect(conversiones()).toHaveLength(1);
    const saldos = await contexto.billetera?.obtenerSaldos(USUARIO);
    expect(saldos?.bono.toFixed(2)).toBe('0.00');

    // Sin saldo de bono pendiente, un cupón posterior se otorga con normalidad.
    await expect(aplicarGratis('GRATIS2', '2.00')).resolves.toMatchObject({ tipoSaldo: 'BONO' });
    expect(conversiones()).toHaveLength(1);
  });
});
