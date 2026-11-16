import { randomUUID } from 'node:crypto';
import type { ApuestaDto } from '@apuestas/shared';
import request from 'supertest';
import { comoUsuario } from './dobles/guard-prueba.js';
import { type AppPrueba, crearAppPrueba } from './utilidades/app-prueba.js';
import { crearPartidoConMercados, crearUsuarioConSaldo } from './utilidades/fabricas.js';

// HU2 (T042): una apuesta aceptada no se puede modificar ni borrar, ni por la API ni por SQL (FR-021).
describe('HU2: inmutabilidad de las apuestas (e2e)', () => {
  let ctx: AppPrueba;
  let apuesta: ApuestaDto;
  let usuarioId: string;

  beforeAll(async () => {
    ctx = await crearAppPrueba();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.limpiar();
    usuarioId = await crearUsuarioConSaldo(ctx.billetera, '100.00');
    const partido = await crearPartidoConMercados(ctx.prisma);
    const local = partido.mercados[0]!.selecciones.find((s) => s.codigo === 'LOCAL')!;
    apuesta = (
      await request(ctx.app.getHttpServer())
        .post('/api/apuestas')
        .set(comoUsuario(usuarioId))
        .send({
          claveSolicitud: randomUUID(),
          monto: '10.00',
          selecciones: [{ seleccionId: local.id, cuotaVista: '2.10' }],
        })
        .expect(201)
    ).body as ApuestaDto;
  });

  it.each([
    ['dueño', () => comoUsuario(usuarioId)],
    ['operador', () => comoUsuario('operador-1', 'OPERADOR')],
    ['administrador', () => comoUsuario('admin-1', 'ADMINISTRADOR')],
  ])('no existe PUT, PATCH ni DELETE sobre una apuesta (%s)', async (_quien, cabecera) => {
    const servidor = ctx.app.getHttpServer();
    const ruta = `/api/apuestas/${apuesta.id}`;

    await request(servidor).put(ruta).set(cabecera()).send({ monto: '1.00' }).expect(404);
    await request(servidor).patch(ruta).set(cabecera()).send({ monto: '1.00' }).expect(404);
    await request(servidor).delete(ruta).set(cabecera()).expect(404);
  });

  it('la base de datos rechaza cambiar el monto o la cuota congelada por SQL', async () => {
    await expect(
      ctx.prisma.$executeRaw`UPDATE apuesta SET monto = 1 WHERE id = ${apuesta.id}::uuid`,
    ).rejects.toThrow(/solo se pueden cambiar/);
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE seleccion_apostada SET cuota_congelada = 9 WHERE apuesta_id = ${apuesta.id}::uuid`,
    ).rejects.toThrow(/solo se puede cambiar su resultado/);
  });

  it('la base de datos rechaza borrar la apuesta por SQL', async () => {
    await expect(
      ctx.prisma.$executeRaw`DELETE FROM apuesta WHERE id = ${apuesta.id}::uuid`,
    ).rejects.toThrow(/inmutable/);
    expect(await ctx.prisma.apuesta.count()).toBe(1);
  });
});
