import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Reglas de la tabla `usuario` que Prisma no expresa y viven como CHECK en la migración (data-model.md).
// Los datos de cada prueba son únicos: el esquema del Spec 2 no se limpia (research §17).
describe('Esquema de identidad (e2e)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });

  const datosUsuario = (email = `esquema-${randomUUID()}@prueba.local`) => ({
    email,
    nombreCompleto: 'Persona de Prueba',
    fechaNacimiento: new Date('1990-01-01'),
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crea el usuario pendiente de verificación y solo con el rol apostador', async () => {
    const usuario = await prisma.usuario.create({ data: datosUsuario() });

    expect(usuario.estado).toBe('PENDIENTE_VERIFICACION');
    expect(usuario.roles).toEqual(['APOSTADOR']);
    expect(usuario.intentosFallidos).toBe(0);
  });

  it('rechaza un correo con mayúsculas o espacios alrededor', async () => {
    const base = `Esquema-${randomUUID()}@Prueba.local`;

    await expect(prisma.usuario.create({ data: datosUsuario(base) })).rejects.toThrow();
    await expect(
      prisma.usuario.create({ data: datosUsuario(` ${base.toLowerCase()} `) }),
    ).rejects.toThrow();
  });

  it('rechaza un correo repetido', async () => {
    const email = `esquema-${randomUUID()}@prueba.local`;
    await prisma.usuario.create({ data: datosUsuario(email) });

    await expect(prisma.usuario.create({ data: datosUsuario(email) })).rejects.toThrow();
  });

  it('rechaza un usuario sin roles', async () => {
    await expect(
      prisma.usuario.create({ data: { ...datosUsuario(), roles: [] } }),
    ).rejects.toThrow();
  });

  it('rechaza intentos fallidos negativos', async () => {
    await expect(
      prisma.usuario.create({ data: { ...datosUsuario(), intentosFallidos: -1 } }),
    ).rejects.toThrow();
  });
});
