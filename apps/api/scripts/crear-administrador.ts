/**
 * Crea el primer administrador (FR-028): nunca hay una ruta HTTP para esto. Al entrar por primera vez, el guard le
 * exige activar el segundo factor.
 *
 *   pnpm --filter api exec tsx scripts/crear-administrador.ts
 *
 * Pide el correo, el nombre y la contraseña por la terminal (o los toma de ADMIN_EMAIL, ADMIN_NOMBRE y
 * ADMIN_CONTRASENA, útil en Render Shell). Si el correo ya existe, solo le agrega el rol ADMINISTRADOR.
 *
 * No arranca Nest: tsx no emite los metadatos de decoradores que necesita su inyección de dependencias.
 */
import { existsSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ContrasenasService } from '../src/identidad/contrasenas.service.js';
import { motivoContrasenaInvalida, normalizarEmail } from '../src/identidad/politicas.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const terminal = createInterface({ input: stdin, output: stdout });
const preguntar = async (variable: string, pregunta: string): Promise<string> =>
  process.env[variable] ?? (await terminal.question(pregunta)).trim();

const email = normalizarEmail(await preguntar('ADMIN_EMAIL', 'Correo del administrador: '));
const nombre = await preguntar('ADMIN_NOMBRE', 'Nombre completo: ');
const contrasena = await preguntar('ADMIN_CONTRASENA', 'Contraseña (mínimo 12 caracteres): ');
terminal.close();

const motivo = motivoContrasenaInvalida(contrasena, email);
if (!email.includes('@') || nombre.length < 3 || motivo) {
  console.error(motivo ?? 'Escribe un correo y un nombre válidos.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const hash = await new ContrasenasService().hashear(contrasena);

const usuario = await prisma.$transaction(async (tx) => {
  const existente = await tx.usuario.findUnique({ where: { email } });
  const fila = existente
    ? await tx.usuario.update({
        where: { email },
        data: { roles: [...new Set([...existente.roles, 'ADMINISTRADOR' as const])] },
      })
    : await tx.usuario.create({
        data: {
          email,
          nombreCompleto: nombre,
          // El script no pide la fecha: un administrador es personal de la plataforma, no un apostador.
          fechaNacimiento: new Date('1970-01-01'),
          roles: ['ADMINISTRADOR'],
          estado: 'ACTIVO',
          correoVerificadoEn: new Date(),
          credencial: { create: { hashContrasena: hash } },
        },
      });
  await tx.eventoAuditoria.create({
    data: {
      actorId: null,
      accion: 'usuario.rol_cambiado',
      entidad: 'usuario',
      entidadId: fila.id,
      datos: {
        anteriores: existente?.roles ?? [],
        nuevos: fila.roles,
        origen: 'script crear-administrador',
      },
    },
  });
  return fila;
});

console.log(
  `Administrador listo: ${usuario.email}. Al iniciar sesión deberá activar el segundo factor.`,
);
await prisma.$disconnect();
