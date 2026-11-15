import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  CUENTA_CASA,
  cuentaUsuario,
  LibroContableService,
} from '../src/billetera/libro-contable.service.js';
import {
  BILLETERA_PORT,
  type BilleteraPort,
  ConflictoIdempotenciaError,
  SaldoInsuficienteError,
  UsuarioNoHabilitadoError,
} from '../src/contracts/billetera.port.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import { crearUsuario } from './ayudas/fabricas-identidad.js';
import { sesionDePrueba } from './ayudas/sesion-de-prueba.js';

const d = (valor: string) => new Prisma.Decimal(valor);

// HU4 y vectores de fraude del libro contable: doble gasto, idempotencia, edición y saldo derivado (FR-034 a FR-044).
describe('Billetera y libro contable (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let billetera: BilleteraPort;
  let libro: LibroContableService;

  /** Saldo real inicial con un asiento de depósito de prueba (pasarela → usuario). */
  const fondear = (usuarioId: string, monto: string) =>
    prisma.$transaction((tx) =>
      libro.registrar(tx, {
        usuarioId,
        tipo: 'DEPOSITO',
        claveIdempotencia: `prueba:${randomUUID()}:fondeo`,
        origenTipo: 'prueba',
        origenId: usuarioId,
        movimientos: [
          { cuenta: 'pasarela', monto: d(monto).neg() },
          { cuenta: cuentaUsuario(usuarioId, 'REAL'), monto: d(monto) },
        ],
      }),
    );

  const apostar = (usuarioId: string, monto: string, clave = `apuesta:${randomUUID()}:debito`) =>
    prisma.$transaction((tx) =>
      billetera.debitarApuesta(tx, {
        usuarioId,
        apuestaId: randomUUID(),
        monto: d(monto),
        tipoSaldo: 'REAL',
        claveIdempotencia: clave,
      }),
    );

  beforeAll(async () => {
    app = await crearAppDePrueba();
    prisma = app.get(PrismaService);
    billetera = app.get(BILLETERA_PORT);
    libro = app.get(LibroContableService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('doble gasto: 20 débitos simultáneos de 10.00 sobre 100.00 aceptan exactamente 10 y el saldo queda en 0.00', async () => {
    const usuario = await crearUsuario(app);
    await fondear(usuario.id, '100.00');

    const resultados = await Promise.allSettled(
      Array.from({ length: 20 }, () => apostar(usuario.id, '10.00')),
    );

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const rechazos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazos.every((r) => r.reason instanceof SaldoInsuficienteError)).toBe(true);
    expect((await billetera.obtenerSaldos(usuario.id)).real.toFixed(2)).toBe('0.00');
  });

  it('idempotencia: repetir la misma clave no crea otro asiento; reusarla con otro monto es un error', async () => {
    const usuario = await crearUsuario(app);
    await fondear(usuario.id, '50.00');
    const clave = `apuesta:${randomUUID()}:debito`;

    const primero = await apostar(usuario.id, '20.00', clave);
    const repetido = await apostar(usuario.id, '20.00', clave);

    expect(primero.creado).toBe(true);
    expect(repetido).toEqual({ asientoId: primero.asientoId, creado: false });
    expect((await billetera.obtenerSaldos(usuario.id)).real.toFixed(2)).toBe('30.00');
    await expect(apostar(usuario.id, '5.00', clave)).rejects.toThrow(ConflictoIdempotenciaError);
  });

  it('si la operación de quien llama falla, el débito se revierte con ella', async () => {
    const usuario = await crearUsuario(app);
    await fondear(usuario.id, '10.00');

    await expect(
      prisma.$transaction(async (tx) => {
        await billetera.debitarApuesta(tx, {
          usuarioId: usuario.id,
          apuestaId: randomUUID(),
          monto: d('10.00'),
          tipoSaldo: 'REAL',
          claveIdempotencia: `apuesta:${randomUUID()}:debito`,
        });
        throw new Error('la apuesta no se pudo registrar');
      }),
    ).rejects.toThrow('la apuesta no se pudo registrar');

    expect((await billetera.obtenerSaldos(usuario.id)).real.toFixed(2)).toBe('10.00');
  });

  it('real y bono no se mezclan, y solo revertirPremio deja el saldo negativo', async () => {
    const usuario = await crearUsuario(app);
    await prisma.$transaction((tx) =>
      billetera.acreditarBono(tx, {
        usuarioId: usuario.id,
        monto: d('5.00'),
        referencia: 'cupon-prueba',
        claveIdempotencia: `cupon:${randomUUID()}:${usuario.id}:bono`,
      }),
    );

    await expect(apostar(usuario.id, '1.00')).rejects.toThrow(SaldoInsuficienteError);
    await prisma.$transaction((tx) =>
      billetera.revertirPremio(tx, {
        usuarioId: usuario.id,
        apuestaId: randomUUID(),
        monto: d('3.00'),
        tipoSaldo: 'REAL',
        claveIdempotencia: `apuesta:${randomUUID()}:reversion:r1`,
      }),
    );

    const saldos = await billetera.obtenerSaldos(usuario.id);
    expect([saldos.real.toFixed(2), saldos.bono.toFixed(2)]).toEqual(['-3.00', '5.00']);
  });

  it('no acredita bonos a una cuenta sin correo verificado (FR-006)', async () => {
    const usuario = await crearUsuario(app, { verificado: false });

    await expect(
      prisma.$transaction((tx) =>
        billetera.acreditarBono(tx, {
          usuarioId: usuario.id,
          monto: d('5.00'),
          referencia: 'cupon-prueba',
          claveIdempotencia: `cupon:${randomUUID()}:${usuario.id}:bono`,
        }),
      ),
    ).rejects.toThrow(UsuarioNoHabilitadoError);
  });

  it('edición del libro: asientos y líneas no se pueden modificar, borrar ni vaciar, y un asiento descuadrado no entra', async () => {
    const usuario = await crearUsuario(app);
    const { asientoId } = await fondear(usuario.id, '1.00');

    await expect(
      prisma.$executeRaw`UPDATE linea_asiento SET monto = 1000 WHERE asiento_id = ${asientoId}::uuid`,
    ).rejects.toThrow(/solo inserción/);
    await expect(
      prisma.$executeRaw`DELETE FROM asiento WHERE id = ${asientoId}::uuid`,
    ).rejects.toThrow(/solo inserción/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE linea_asiento, asiento')).rejects.toThrow(
      /solo inserción/,
    );
    await expect(
      prisma.$transaction((tx) =>
        libro.registrar(tx, {
          usuarioId: usuario.id,
          tipo: 'PREMIO',
          claveIdempotencia: `prueba:${randomUUID()}:descuadre`,
          origenTipo: 'prueba',
          origenId: usuario.id,
          movimientos: [
            { cuenta: CUENTA_CASA, monto: d('-1.00') },
            { cuenta: cuentaUsuario(usuario.id, 'REAL'), monto: d('999.00') },
          ],
        }),
      ),
    ).rejects.toThrow(/no cuadra/);
  });

  it('muestra al usuario sus saldos y movimientos con el saldo resultante', async () => {
    const usuario = await crearUsuario(app);
    await fondear(usuario.id, '25.00');
    await apostar(usuario.id, '5.00');
    const { cookie } = await sesionDePrueba(app, { usuarioId: usuario.id, email: usuario.email });

    const saldos = await request(app.getHttpServer())
      .get('/api/billetera')
      .set('Cookie', cookie)
      .expect(200);
    expect(saldos.body).toEqual({ real: '20.00', bono: '0.00', retirable: '20.00' });
    const { body } = await request(app.getHttpServer())
      .get('/api/billetera/movimientos')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      body.items.map((m: { monto: string; saldoResultante: string }) => [
        m.monto,
        m.saldoResultante,
      ]),
    ).toEqual([
      ['-5.00', '20.00'],
      ['25.00', '25.00'],
    ]);
  });
});
