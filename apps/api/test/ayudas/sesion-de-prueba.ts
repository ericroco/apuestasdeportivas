import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Rol, UsuarioAutenticado } from '../../src/contracts/autenticacion.js';
import { COOKIE_ACCESO } from '../../src/identidad/autenticacion.guard.js';
import { type Alcance, TokensService } from '../../src/identidad/tokens.service.js';

/**
 * Token de acceso REAL (firmado con la clave de la app) para cualquier rol, para que las pruebas e2e de los specs
 * 2, 3 y 4 pasen por el guard global de verdad en lugar de sobrescribirlo (contratos.md §1).
 *
 *   const { cookie, usuario } = await sesionDePrueba(app, { roles: ['OPERADOR'] });
 *   await request(app.getHttpServer()).post('/api/operador/partidos').set('Cookie', cookie)…
 *
 * El usuario no existe en la base salvo que se pase `usuarioId` de uno creado por la prueba.
 */
export async function sesionDePrueba(
  app: INestApplication,
  opciones: { roles?: Rol[]; usuarioId?: string; email?: string; alcance?: Alcance } = {},
): Promise<{ cookie: string; token: string; usuario: UsuarioAutenticado }> {
  const usuario: UsuarioAutenticado = {
    id: opciones.usuarioId ?? randomUUID(),
    email: opciones.email ?? `prueba-${randomUUID()}@prueba.local`,
    roles: opciones.roles ?? ['APOSTADOR'],
  };
  const token = await app.get(TokensService).emitirAcceso({
    usuario,
    sesionId: randomUUID(),
    alcance: opciones.alcance ?? 'completo',
  });
  return { cookie: `${COOKIE_ACCESO}=${token}`, token, usuario };
}
