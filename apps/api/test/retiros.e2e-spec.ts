import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { cuentaUsuario, LibroContableService } from '../src/billetera/libro-contable.service.js';
import type { Rol } from '../src/contracts/autenticacion.js';
import { BILLETERA_PORT, type BilleteraPort } from '../src/contracts/billetera.port.js';
import { EVENTOS, type RetiroSolicitado } from '../src/contracts/eventos.js';
import { RIESGO_PORT, type RiesgoPort } from '../src/contracts/promociones.port.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import { activar2faConCodigos, crearUsuario } from './ayudas/fabricas-identidad.js';
import { sesionDePrueba } from './ayudas/sesion-de-prueba.js';

/** RIESGO_PORT de prueba (en producción lo trae el Spec 4): marca para revisión los retiros de 77.00. */
const riesgo: RiesgoPort = {
  evaluarRetiro: (_usuarioId, monto) =>
    Promise.resolve(
      monto.eq(77)
        ? { requiereRevision: true, motivos: ['retiro_tras_deposito_sin_actividad'] }
        : { requiereRevision: false, motivos: [] },
    ),
};

@Global()
@Module({ providers: [{ provide: RIESGO_PORT, useValue: riesgo }], exports: [RIESGO_PORT] })
class RiesgoDePrueba {}

// HU7 y HU8, y el vector "retiro sin 2FA o a otro titular" del brief (FR-053 a FR-060).
describe('Retiros (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let billetera: BilleteraPort;
  let libro: LibroContableService;
  const servidor = () => request(app.getHttpServer());

  /** Apostador verificado con 2FA, saldo real depositado y el método de ese depósito. */
  const apostadorConSaldo = async (saldo = '200.00', opciones: { con2fa?: boolean } = {}) => {
    const usuario = await crearUsuario(app);
    const { codigos } =
      opciones.con2fa === false ? { codigos: [] } : await activar2faConCodigos(app, usuario);
    const metodo = await prisma.metodoPago.create({
      data: {
        usuarioId: usuario.id,
        tipo: 'TARJETA',
        marca: 'Visa',
        ultimosDigitos: '4242',
        huella: randomUUID(),
      },
    });
    await prisma.$transaction((tx) =>
      libro.registrar(tx, {
        usuarioId: usuario.id,
        tipo: 'DEPOSITO',
        claveIdempotencia: `prueba:${randomUUID()}:fondeo`,
        origenTipo: 'prueba',
        origenId: usuario.id,
        movimientos: [
          { cuenta: 'pasarela', monto: new Prisma.Decimal(saldo).neg() },
          { cuenta: cuentaUsuario(usuario.id, 'REAL'), monto: new Prisma.Decimal(saldo) },
        ],
      }),
    );
    const { cookie } = await sesionDePrueba(app, { usuarioId: usuario.id, email: usuario.email });
    return { usuario, codigos, metodo, cookie };
  };

  const retirar = (
    cookie: string,
    cuerpo: { monto: string; metodoPagoId: string; codigo2fa: string; claveSolicitud?: string },
  ) =>
    servidor()
      .post('/api/retiros')
      .set('Cookie', cookie)
      .send({ claveSolicitud: randomUUID(), ...cuerpo });

  const saldoReal = async (usuarioId: string) =>
    (await billetera.obtenerSaldos(usuarioId)).real.toFixed(2);

  const administrador = async () => {
    const roles: Rol[] = ['ADMINISTRADOR'];
    const admin = await crearUsuario(app, { roles });
    const { codigos } = await activar2faConCodigos(app, admin);
    const { cookie } = await sesionDePrueba(app, {
      usuarioId: admin.id,
      email: admin.email,
      roles,
    });
    return { cookie, codigos };
  };

  beforeAll(async () => {
    app = await crearAppDePrueba({ modulos: [RiesgoDePrueba] });
    prisma = app.get(PrismaService);
    billetera = app.get(BILLETERA_PORT);
    libro = app.get(LibroContableService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('bajo el umbral se paga al instante con referencia simulada, se audita y emite el evento', async () => {
    const eventos: RetiroSolicitado[] = [];
    app.get(EventEmitter2).on(EVENTOS.retiroSolicitado, (e: RetiroSolicitado) => eventos.push(e));
    const { usuario, codigos, metodo, cookie } = await apostadorConSaldo('200.00');

    const respuesta = await retirar(cookie, {
      monto: '50.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[0]!,
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      estado: 'PAGADO',
      referenciaPago: expect.stringMatching(/^SIM-/),
    });
    expect(await saldoReal(usuario.id)).toBe('150.00');
    expect(eventos).toContainEqual(
      expect.objectContaining({ retiroId: respuesta.body.id, monto: '50.00' }),
    );
  });

  it('sin 2FA activo o con un código incorrecto se rechaza', async () => {
    const sin2fa = await apostadorConSaldo('100.00', { con2fa: false });
    await retirar(sin2fa.cookie, {
      monto: '10.00',
      metodoPagoId: sin2fa.metodo.id,
      codigo2fa: '123456',
    }).expect(403);

    const con2fa = await apostadorConSaldo('100.00');
    await retirar(con2fa.cookie, {
      monto: '10.00',
      metodoPagoId: con2fa.metodo.id,
      codigo2fa: '000000',
    }).expect(403);
    expect(await saldoReal(con2fa.usuario.id)).toBe('100.00');
  });

  it('no se puede retirar a un método o titular de otro usuario', async () => {
    const victima = await apostadorConSaldo('100.00');
    const atacante = await apostadorConSaldo('100.00');

    await retirar(atacante.cookie, {
      monto: '10.00',
      metodoPagoId: victima.metodo.id,
      codigo2fa: atacante.codigos[0]!,
    }).expect(400);
  });

  it('no se retira más que el saldo real ni con saldo negativo, y el bono no es retirable', async () => {
    const { usuario, codigos, metodo, cookie } = await apostadorConSaldo('20.00');
    await retirar(cookie, {
      monto: '25.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[0]!,
    }).expect(400);

    await prisma.$transaction((tx) =>
      billetera.revertirPremio(tx, {
        usuarioId: usuario.id,
        apuestaId: randomUUID(),
        monto: new Prisma.Decimal('30.00'),
        tipoSaldo: 'REAL',
        claveIdempotencia: `apuesta:${randomUUID()}:reversion:r1`,
      }),
    );
    await retirar(cookie, {
      monto: '5.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[1]!,
    }).expect(400);
    expect(await saldoReal(usuario.id)).toBe('-10.00');
  });

  it('sobre el umbral, o si el riesgo lo pide, queda pendiente de revisión con sus motivos', async () => {
    const { codigos, metodo, cookie } = await apostadorConSaldo('500.00');

    const grande = await retirar(cookie, {
      monto: '150.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[0]!,
    });
    const riesgoso = await retirar(cookie, {
      monto: '77.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[1]!,
    });

    expect(grande.body).toMatchObject({ estado: 'PENDIENTE_REVISION' });
    expect(grande.body.motivosRevision[0]).toMatch(/umbral/);
    expect(riesgoso.body).toMatchObject({
      estado: 'PENDIENTE_REVISION',
      motivosRevision: ['retiro_tras_deposito_sin_actividad'],
    });
  });

  it('dos solicitudes simultáneas que superan el saldo aceptan solo una, y repetir la clave no duplica', async () => {
    const { usuario, codigos, metodo, cookie } = await apostadorConSaldo('60.00');

    const [a, b] = await Promise.all([
      retirar(cookie, { monto: '40.00', metodoPagoId: metodo.id, codigo2fa: codigos[0]! }),
      retirar(cookie, { monto: '40.00', metodoPagoId: metodo.id, codigo2fa: codigos[1]! }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await saldoReal(usuario.id)).toBe('20.00');

    const claveSolicitud = randomUUID();
    const uno = await retirar(cookie, {
      monto: '10.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[2]!,
      claveSolicitud,
    });
    const otro = await retirar(cookie, {
      monto: '10.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[3]!,
      claveSolicitud,
    });
    expect(otro.body.id).toBe(uno.body.id);
    expect(await saldoReal(usuario.id)).toBe('10.00');
  });

  it('el administrador aprueba o rechaza con su 2FA, sin efectos repetidos', async () => {
    const admin = await administrador();
    const { usuario, codigos, metodo, cookie } = await apostadorConSaldo('500.00');
    const primero = await retirar(cookie, {
      monto: '200.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[0]!,
    });
    const segundo = await retirar(cookie, {
      monto: '150.00',
      metodoPagoId: metodo.id,
      codigo2fa: codigos[1]!,
    });
    expect(await saldoReal(usuario.id)).toBe('150.00');
    const admin2fa = (n: number) => admin.codigos[n]!;

    const pendientes = await servidor()
      .get('/api/admin/retiros')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(pendientes.body.map((r: { id: string }) => r.id)).toEqual(
      expect.arrayContaining([primero.body.id, segundo.body.id]),
    );
    await servidor()
      .post(`/api/admin/retiros/${primero.body.id}/aprobacion`)
      .set('Cookie', admin.cookie)
      .send({ codigo2fa: '000000' })
      .expect(403);
    const aprobado = await servidor()
      .post(`/api/admin/retiros/${primero.body.id}/aprobacion`)
      .set('Cookie', admin.cookie)
      .send({ codigo2fa: admin2fa(0) })
      .expect(200);
    expect(aprobado.body).toMatchObject({
      estado: 'PAGADO',
      referenciaPago: expect.stringMatching(/^SIM-/),
    });

    await servidor()
      .post(`/api/admin/retiros/${segundo.body.id}/rechazo`)
      .set('Cookie', admin.cookie)
      .send({ motivo: 'Titular no coincide con el registro', codigo2fa: admin2fa(1) })
      .expect(200);
    expect(await saldoReal(usuario.id)).toBe('300.00');

    // Repetir la resolución no cambia nada (ni paga ni devuelve dos veces).
    const repetido = await servidor()
      .post(`/api/admin/retiros/${segundo.body.id}/aprobacion`)
      .set('Cookie', admin.cookie)
      .send({ codigo2fa: admin2fa(2) })
      .expect(200);
    expect(repetido.body.estado).toBe('RECHAZADO');
    expect(await saldoReal(usuario.id)).toBe('300.00');
  });

  it('operadores y administradores no pueden retirar', async () => {
    const roles: Rol[] = ['APOSTADOR', 'OPERADOR'];
    const operador = await crearUsuario(app, { roles });
    const { cookie } = await sesionDePrueba(app, {
      usuarioId: operador.id,
      email: operador.email,
      roles,
    });

    await retirar(cookie, {
      monto: '10.00',
      metodoPagoId: randomUUID(),
      codigo2fa: '123456',
    }).expect(403);
  });
});
