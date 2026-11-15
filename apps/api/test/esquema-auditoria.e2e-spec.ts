import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// La auditoría es de solo inserción incluso para el dueño de las tablas (FR-030): lo garantizan disparadores.
describe('Esquema de auditoría (e2e)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });

  const registrar = () =>
    prisma.eventoAuditoria.create({
      data: {
        actorId: null,
        accion: 'prueba.registrada',
        entidad: 'prueba',
        entidadId: randomUUID(),
        datos: { motivo: 'esquema' },
        ip: '127.0.0.1',
        dispositivo: 'vitest',
      },
    });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('inserta un evento con fecha del servidor', async () => {
    const antes = Date.now();
    const evento = await registrar();

    expect(evento.creadoEn.getTime()).toBeGreaterThanOrEqual(antes - 5_000);
    expect(evento.datos).toEqual({ motivo: 'esquema' });
  });

  it('rechaza modificar un evento', async () => {
    const evento = await registrar();

    await expect(
      prisma.eventoAuditoria.update({ where: { id: evento.id }, data: { accion: 'otra.accion' } }),
    ).rejects.toThrow(/solo inserción/);
  });

  it('rechaza borrar un evento', async () => {
    const evento = await registrar();

    await expect(prisma.eventoAuditoria.delete({ where: { id: evento.id } })).rejects.toThrow(
      /solo inserción/,
    );
  });

  it('rechaza vaciar la tabla', async () => {
    await registrar();

    await expect(prisma.$executeRawUnsafe('TRUNCATE "evento_auditoria"')).rejects.toThrow(
      /solo inserción/,
    );
  });

  it('rechaza una acción que no sigue el formato entidad.verbo_en_pasado', async () => {
    await expect(
      prisma.eventoAuditoria.create({
        data: { accion: 'Sin Formato', entidad: 'prueba', entidadId: null },
      }),
    ).rejects.toThrow();
  });
});
