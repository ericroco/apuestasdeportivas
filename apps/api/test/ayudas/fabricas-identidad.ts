import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import type { Rol } from '../../src/contracts/autenticacion.js';
import type { Usuario } from '../../src/generated/prisma/client.js';
import { ContrasenasService } from '../../src/identidad/contrasenas.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export const CONTRASENA_PRUEBA = 'Una-Clave-Segura-2026';

/** Crea un usuario real (con credencial) con datos únicos. Verificado y activo salvo que se indique otra cosa. */
export async function crearUsuario(
  app: INestApplication,
  opciones: { roles?: Rol[]; verificado?: boolean; contrasena?: string } = {},
): Promise<Usuario> {
  const verificado = opciones.verificado ?? true;
  const hash = await app.get(ContrasenasService).hashear(opciones.contrasena ?? CONTRASENA_PRUEBA);
  return app.get(PrismaService).usuario.create({
    data: {
      email: `usuario-${randomUUID()}@prueba.local`,
      nombreCompleto: 'Persona de Prueba',
      fechaNacimiento: new Date('1990-05-20'),
      roles: opciones.roles ?? ['APOSTADOR'],
      estado: verificado ? 'ACTIVO' : 'PENDIENTE_VERIFICACION',
      correoVerificadoEn: verificado ? new Date() : null,
      credencial: { create: { hashContrasena: hash } },
    },
  });
}

/** Cookies `nombre=valor` de una respuesta, y sus atributos para comprobar httpOnly, Path, etc. */
export function cookiesDe(
  respuesta: Response,
): Record<string, { valor: string; atributos: string }> {
  const cabecera = respuesta.headers['set-cookie'] as unknown as string[] | undefined;
  const resultado: Record<string, { valor: string; atributos: string }> = {};
  for (const linea of cabecera ?? []) {
    const [par = '', ...resto] = linea.split(';');
    const [nombre = '', ...valor] = par.split('=');
    resultado[nombre.trim()] = { valor: valor.join('='), atributos: resto.join(';') };
  }
  return resultado;
}

/** IP distinta por petición: el límite de 5 por minuto de las rutas públicas no debe cortar las pruebas. */
export function generadorDeIps(): () => string {
  let n = 0;
  return () => `198.51.${Math.floor(n / 250) % 250}.${(n++ % 250) + 1}`;
}
