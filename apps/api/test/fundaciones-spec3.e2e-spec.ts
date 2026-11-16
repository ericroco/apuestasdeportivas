import { randomUUID } from 'node:crypto';
import { Decimal } from '../src/comun/decimal.js';
import { SaldoInsuficienteError } from '../src/contracts/index.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados, crearUsuarioConSaldo } from './utilidades/fabricas.js';

// Checkpoint de la fase 2 (tasks.md): el esquema nuevo, las fábricas y los dobles del Spec 2 funcionan
// contra PostgreSQL real, y la billetera de prueba cumple el contrato (atomicidad, bloqueo, idempotencia).
describe('Spec 3: base de datos y dobles (e2e)', () => {
  let contexto: AppPrueba;

  beforeAll(async () => {
    contexto = await crearAppPrueba();
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  beforeEach(async () => {
    await contexto.limpiar();
  });

  async function crearApuestaDirecta(usuarioId: string) {
    const partido = await crearPartidoConMercados(contexto.prisma);
    const seleccion = partido.mercados[0]!.selecciones[0]!;
    return contexto.prisma.apuesta.create({
      data: {
        usuarioId,
        claveSolicitud: randomUUID(),
        tipo: 'SIMPLE',
        monto: '10.00',
        tipoSaldo: 'REAL',
        cuotaTotal: seleccion.cuota,
        gananciaPotencial: '21.00',
        enVivo: false,
        selecciones: {
          create: {
            seleccionId: seleccion.id,
            partidoId: partido.id,
            cuotaCongelada: seleccion.cuota,
          },
        },
      },
    });
  }

  describe('billetera de prueba', () => {
    it('revierte el débito si la transacción de la apuesta falla después', async () => {
      const usuarioId = await crearUsuarioConSaldo(contexto.billetera, '50.00');

      await expect(
        contexto.prisma.$transaction(async (tx) => {
          await contexto.billetera.debitarApuesta(tx, {
            usuarioId,
            apuestaId: randomUUID(),
            tipoSaldo: 'REAL',
            monto: new Decimal('20.00'),
            claveIdempotencia: `apuesta:${randomUUID()}:debito`,
          });
          throw new Error('falla posterior al débito');
        }),
      ).rejects.toThrow('falla posterior al débito');

      const saldos = await contexto.billetera.obtenerSaldos(usuarioId);
      expect(saldos.real.toFixed(2)).toBe('50.00');
    });

    it('rechaza un débito mayor al saldo con SaldoInsuficienteError', async () => {
      const usuarioId = await crearUsuarioConSaldo(contexto.billetera, '5.00');

      await expect(
        contexto.prisma.$transaction((tx) =>
          contexto.billetera.debitarApuesta(tx, {
            usuarioId,
            apuestaId: randomUUID(),
            tipoSaldo: 'REAL',
            monto: new Decimal('5.01'),
            claveIdempotencia: `apuesta:${randomUUID()}:debito`,
          }),
        ),
      ).rejects.toBeInstanceOf(SaldoInsuficienteError);
    });

    it('no crea un segundo asiento con la misma clave de idempotencia', async () => {
      const usuarioId = await crearUsuarioConSaldo(contexto.billetera, '0.01');
      const operacion = {
        usuarioId,
        apuestaId: randomUUID(),
        tipoSaldo: 'REAL' as const,
        monto: new Decimal('15.00'),
        claveIdempotencia: `apuesta:${randomUUID()}:premio`,
      };

      const primero = await contexto.prisma.$transaction((tx) =>
        contexto.billetera.acreditarPremio(tx, operacion),
      );
      const segundo = await contexto.prisma.$transaction((tx) =>
        contexto.billetera.acreditarPremio(tx, operacion),
      );

      expect(primero.creado).toBe(true);
      expect(segundo).toEqual({ asientoId: primero.asientoId, creado: false });
      expect(await contexto.billetera.contarAsientos(usuarioId, 'PREMIO')).toBe(1);
    });

    it('con 20 débitos simultáneos nunca descuenta más que el saldo', async () => {
      const usuarioId = await crearUsuarioConSaldo(contexto.billetera, '100.00');

      const resultados = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          contexto.prisma.$transaction((tx) =>
            contexto.billetera.debitarApuesta(tx, {
              usuarioId,
              apuestaId: randomUUID(),
              tipoSaldo: 'REAL',
              monto: new Decimal('15.00'),
              claveIdempotencia: `apuesta:${randomUUID()}:debito`,
            }),
          ),
        ),
      );

      const aceptados = resultados.filter((r) => r.status === 'fulfilled').length;
      const saldos = await contexto.billetera.obtenerSaldos(usuarioId);
      expect(aceptados).toBe(6);
      expect(saldos.real.toFixed(2)).toBe('10.00');
    });

    it('revertirPremio puede dejar el saldo negativo (FR-038)', async () => {
      const usuarioId = await crearUsuarioConSaldo(contexto.billetera, '1.00');

      await contexto.prisma.$transaction((tx) =>
        contexto.billetera.revertirPremio(tx, {
          usuarioId,
          apuestaId: randomUUID(),
          tipoSaldo: 'REAL',
          monto: new Decimal('5.00'),
          claveIdempotencia: `apuesta:${randomUUID()}:reversion:r1`,
        }),
      );

      expect((await contexto.billetera.obtenerSaldos(usuarioId)).real.toFixed(2)).toBe('-4.00');
    });
  });

  describe('inmutabilidad en la base de datos', () => {
    it('rechaza cambiar el monto de una apuesta aceptada', async () => {
      const apuesta = await crearApuestaDirecta('usuario-inmutable');

      await expect(
        contexto.prisma.$executeRaw`UPDATE apuesta SET monto = 1 WHERE id = ${apuesta.id}::uuid`,
      ).rejects.toThrow(/solo se pueden cambiar/);
    });

    it('rechaza borrar una apuesta aceptada', async () => {
      const apuesta = await crearApuestaDirecta('usuario-inmutable');

      await expect(contexto.prisma.apuesta.delete({ where: { id: apuesta.id } })).rejects.toThrow(
        /inmutable/,
      );
    });

    it('permite liquidarla: cambiar estado, premio y fecha de liquidación', async () => {
      const apuesta = await crearApuestaDirecta('usuario-inmutable');

      const liquidada = await contexto.prisma.apuesta.update({
        where: { id: apuesta.id },
        data: { estado: 'GANADA', premioPagado: '21.00', liquidadaEn: new Date() },
      });

      expect(liquidada.estado).toBe('GANADA');
    });

    it('rechaza una cuota de 1.00 o menor', async () => {
      await expect(
        crearPartidoConMercados(contexto.prisma, { mercados: [{ cuotas: { LOCAL: '1.00' } }] }),
      ).rejects.toThrow(/seleccion_cuota_mayor_a_uno/);
    });

    it('rechaza una línea de goles que no termina en .5', async () => {
      await expect(
        crearPartidoConMercados(contexto.prisma, {
          mercados: [
            { tipo: 'MAS_MENOS_GOLES', linea: '2.0', cuotas: { MAS: '1.90', MENOS: '1.90' } },
          ],
        }),
      ).rejects.toThrow(/mercado_linea_valida/);
    });
  });
});
