import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { BILLETERA_PORT, type BilleteraPort } from '../src/contracts/billetera.port.js';
import { type DepositoConfirmado, EVENTOS } from '../src/contracts/eventos.js';
import { DepositosService } from '../src/pagos/depositos.service.js';
import {
  type ConfirmacionPasarela,
  PASARELA_PORT,
  type PasarelaPort,
} from '../src/pagos/pasarela.port.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import { crearUsuario, generadorDeIps } from './ayudas/fabricas-identidad.js';
import { sesionDePrueba } from './ayudas/sesion-de-prueba.js';

let siguienteTransaccion = Date.now();

/** Pasarela falsa: aprueba lo que se preparó, salvo que la prueba le pida otra respuesta. */
class PasarelaDePrueba implements PasarelaPort {
  readonly preparadas = new Map<string, number>();
  readonly reversos: number[] = [];
  readonly llamadasConfirmar: number[] = [];
  respuesta: (referencia: string, centavos: number) => Partial<ConfirmacionPasarela> = () => ({});

  preparar(s: { montoCentavos: number; referencia: string }) {
    this.preparadas.set(s.referencia, s.montoCentavos);
    return Promise.resolve({
      paymentId: `pago-${s.referencia}`,
      urlPago: `https://pago.prueba/${s.referencia}`,
    });
  }

  confirmar(id: number, referencia: string): Promise<ConfirmacionPasarela> {
    this.llamadasConfirmar.push(id);
    const centavos = this.preparadas.get(referencia) ?? 0;
    return Promise.resolve({
      statusCode: 3,
      transactionStatus: 'Approved',
      transactionId: id,
      clientTransactionId: referencia,
      amount: centavos,
      currency: 'USD',
      cardBrand: 'Visa',
      lastDigits: '4242',
      optionalParameter4: 'PERSONA DE PRUEBA',
      ...this.respuesta(referencia, centavos),
    });
  }

  reversar(transactionId: number) {
    this.reversos.push(transactionId);
    return Promise.resolve();
  }
}

// HU5 y vectores de fraude de pagos: doble acreditación, depósito manipulado y regreso sin confirmación (FR-045 a FR-052).
describe('Depósitos con la pasarela (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let billetera: BilleteraPort;
  const pasarela = new PasarelaDePrueba();
  const ip = generadorDeIps();
  const proxyOriginal = process.env['TRUST_PROXY_HOPS'];

  const servidor = () => request(app.getHttpServer());
  const iniciar = async (monto = '50.00', roles: ('APOSTADOR' | 'OPERADOR')[] = ['APOSTADOR']) => {
    const usuario = await crearUsuario(app, { roles });
    const { cookie } = await sesionDePrueba(app, {
      usuarioId: usuario.id,
      email: usuario.email,
      roles,
    });
    const respuesta = await servidor()
      .post('/api/pagos/depositos')
      .set('Cookie', cookie)
      .send({ monto });
    return { usuario, cookie, respuesta, intencionId: respuesta.body.intencionId as string };
  };
  const confirmar = (id: number, clientTransactionId: string) =>
    servidor()
      .post('/api/pagos/depositos/confirmar')
      .set('X-Forwarded-For', ip())
      .send({ id, clientTransactionId });
  const saldoReal = async (usuarioId: string) =>
    (await billetera.obtenerSaldos(usuarioId)).real.toFixed(2);

  beforeAll(async () => {
    process.env['TRUST_PROXY_HOPS'] = '1';
    app = await crearAppDePrueba({ sustituir: [{ token: PASARELA_PORT, valor: pasarela }] });
    prisma = app.get(PrismaService);
    billetera = app.get(BILLETERA_PORT);
  });

  afterEach(() => {
    pasarela.respuesta = () => ({});
  });

  afterAll(async () => {
    await app.close();
    if (proxyOriginal === undefined) delete process.env['TRUST_PROXY_HOPS'];
    else process.env['TRUST_PROXY_HOPS'] = proxyOriginal;
  });

  it('acredita una sola vez aunque la confirmación llegue 10 veces, algunas a la vez, y emite el evento', async () => {
    const eventos: DepositoConfirmado[] = [];
    app
      .get(EventEmitter2)
      .on(EVENTOS.depositoConfirmado, (e: DepositoConfirmado) => eventos.push(e));
    const { usuario, respuesta, intencionId } = await iniciar('50.00');
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.urlPago).toContain(intencionId);
    const transaccion = ++siguienteTransaccion;

    const simultaneas = await Promise.all(
      Array.from({ length: 5 }, () => confirmar(transaccion, intencionId)),
    );
    for (let i = 0; i < 5; i++) await confirmar(transaccion, intencionId).expect(200);

    expect(simultaneas.every((r) => r.status === 200 && r.body.estado === 'CONFIRMADA')).toBe(true);
    expect(await saldoReal(usuario.id)).toBe('50.00');
    expect(eventos.filter((e) => e.depositoId === intencionId)).toHaveLength(1);
    const metodo = await prisma.metodoPago.findMany({ where: { usuarioId: usuario.id } });
    expect(metodo).toEqual([expect.objectContaining({ marca: 'Visa', ultimosDigitos: '4242' })]);
  });

  it.each([
    ['el monto', (_r: string, centavos: number) => ({ amount: centavos * 10 })],
    ['la moneda', () => ({ currency: 'EUR' })],
    ['la referencia', () => ({ clientTransactionId: '00000000-0000-4000-8000-000000000000' })],
  ])(
    'rechaza la confirmación si no coincide %s, lo audita y pide el reverso',
    async (_campo, cambio) => {
      pasarela.respuesta = cambio;
      const { usuario, intencionId } = await iniciar('20.00');
      const transaccion = ++siguienteTransaccion;

      const respuesta = await confirmar(transaccion, intencionId).expect(200);

      expect(respuesta.body.estado).toBe('RECHAZADA_DISCREPANCIA');
      expect(await saldoReal(usuario.id)).toBe('0.00');
      expect(pasarela.reversos).toContain(transaccion);
      const auditoria = await prisma.eventoAuditoria.findMany({
        where: { entidadId: intencionId },
      });
      expect(auditoria.map((e) => e.accion)).toContain('deposito.discrepancia');
    },
  );

  it('un pago cancelado en la pasarela no acredita nada', async () => {
    pasarela.respuesta = () => ({ statusCode: 2, transactionStatus: 'Canceled' });
    const { usuario, intencionId } = await iniciar('15.00');

    const respuesta = await confirmar(++siguienteTransaccion, intencionId).expect(200);

    expect(respuesta.body.estado).toBe('FALLIDA');
    expect(await saldoReal(usuario.id)).toBe('0.00');
  });

  it('volver de la pasarela sin la confirmación del servidor no cambia el saldo, y la intención caduca', async () => {
    const { usuario, cookie, intencionId } = await iniciar('30.00');
    await prisma.intencionPago.update({
      where: { id: intencionId },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });

    const estado = await servidor()
      .get(`/api/pagos/depositos/${intencionId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(estado.body.estado).toBe('PENDIENTE');
    expect(await saldoReal(usuario.id)).toBe('0.00');
    await app.get(DepositosService).caducarVencidas();
    const caducada = await prisma.intencionPago.findUniqueOrThrow({ where: { id: intencionId } });
    expect(caducada.estado).toBe('CADUCADA');
  });

  it('no acredita una transacción de la pasarela que ya se usó en otro depósito', async () => {
    const primero = await iniciar('10.00');
    const segundo = await iniciar('10.00');
    const transaccion = ++siguienteTransaccion;
    await confirmar(transaccion, primero.intencionId).expect(200);

    const respuesta = await confirmar(transaccion, segundo.intencionId).expect(200);

    expect(respuesta.body.estado).toBe('RECHAZADA_DISCREPANCIA');
    expect(await saldoReal(segundo.usuario.id)).toBe('0.00');
  });

  it('solo un apostador con el correo verificado puede depositar, dentro de los límites', async () => {
    const operador = await iniciar('10.00', ['APOSTADOR', 'OPERADOR']);
    expect(operador.respuesta.status).toBe(403);

    const sinVerificar = await crearUsuario(app, { verificado: false });
    const { cookie } = await sesionDePrueba(app, {
      usuarioId: sinVerificar.id,
      email: sinVerificar.email,
    });
    await servidor()
      .post('/api/pagos/depositos')
      .set('Cookie', cookie)
      .send({ monto: '10.00' })
      .expect(403);

    const fueraDeLimite = await iniciar('5000.00');
    expect(fueraDeLimite.respuesta.status).toBe(400);
  });
});
