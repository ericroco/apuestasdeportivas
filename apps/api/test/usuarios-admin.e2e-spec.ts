import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import { activar2fa, codigoTotp, crearUsuario } from './ayudas/fabricas-identidad.js';
import { sesionDePrueba } from './ayudas/sesion-de-prueba.js';

// HU9: administración de usuarios, roles y auditoría (FR-021, FR-026 a FR-028, FR-033).
describe('Administración de usuarios y auditoría (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const servidor = () => request(app.getHttpServer());

  /** Administrador real con 2FA activo y su cookie de acceso. */
  const crearAdministrador = async () => {
    const admin = await crearUsuario(app, { roles: ['ADMINISTRADOR'] });
    const totp = await activar2fa(app, admin);
    const { cookie } = await sesionDePrueba(app, {
      usuarioId: admin.id,
      email: admin.email,
      roles: ['ADMINISTRADOR'],
    });
    return { admin, totp, cookie };
  };

  beforeAll(async () => {
    app = await crearAppDePrueba();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('apostadores y operadores no entran al panel de usuarios ni a la auditoría', async () => {
    for (const roles of [['APOSTADOR'], ['APOSTADOR', 'OPERADOR']] as const) {
      const { cookie } = await sesionDePrueba(app, { roles: [...roles] });
      await servidor().get('/api/admin/usuarios').set('Cookie', cookie).expect(403);
      await servidor().get('/api/admin/auditoria').set('Cookie', cookie).expect(403);
    }
  });

  it('busca usuarios por correo y muestra su detalle', async () => {
    const { cookie } = await crearAdministrador();
    const buscado = await crearUsuario(app);

    const lista = await servidor()
      .get('/api/admin/usuarios')
      .query({ q: buscado.email })
      .set('Cookie', cookie)
      .expect(200);
    expect(lista.body.items).toEqual([
      expect.objectContaining({ id: buscado.id, verificado: true }),
    ]);

    const detalle = await servidor()
      .get(`/api/admin/usuarios/${buscado.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(detalle.body).toMatchObject({ email: buscado.email, tiene2fa: false });
  });

  it('cambiar roles exige el 2FA del administrador, se audita y corta el acceso anterior', async () => {
    const { admin, totp, cookie } = await crearAdministrador();
    const apostador = await crearUsuario(app);
    const anterior = await sesionDePrueba(app, { usuarioId: apostador.id, email: apostador.email });
    const ruta = `/api/admin/usuarios/${apostador.id}/roles`;

    await servidor()
      .put(ruta)
      .set('Cookie', cookie)
      .send({ roles: ['APOSTADOR', 'OPERADOR'], codigo2fa: '000000' })
      .expect(403);

    await new Promise((resolver) => setTimeout(resolver, 1_100));
    const cambio = await servidor()
      .put(ruta)
      .set('Cookie', cookie)
      .send({ roles: ['APOSTADOR', 'OPERADOR'], codigo2fa: codigoTotp(totp) })
      .expect(200);
    expect(cambio.body.roles).toEqual(['APOSTADOR', 'OPERADOR']);

    await servidor().get('/api/identidad/yo').set('Cookie', anterior.cookie).expect(401);
    const [evento] = await prisma.eventoAuditoria.findMany({
      where: { entidadId: apostador.id, accion: 'usuario.rol_cambiado' },
    });
    expect(evento).toMatchObject({
      actorId: admin.id,
      datos: { anteriores: ['APOSTADOR'], nuevos: ['APOSTADOR', 'OPERADOR'] },
    });
  });

  it('suspender corta las sesiones de inmediato y reactivar devuelve el acceso', async () => {
    const { cookie } = await crearAdministrador();
    const usuario = await crearUsuario(app);
    const suya = await sesionDePrueba(app, { usuarioId: usuario.id, email: usuario.email });
    await new Promise((resolver) => setTimeout(resolver, 1_100));

    await servidor()
      .post(`/api/admin/usuarios/${usuario.id}/suspension`)
      .set('Cookie', cookie)
      .send({ motivo: 'Actividad sospechosa en prueba' })
      .expect(204);
    await servidor().get('/api/identidad/yo').set('Cookie', suya.cookie).expect(401);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).estado).toBe(
      'SUSPENDIDO',
    );

    await servidor()
      .delete(`/api/admin/usuarios/${usuario.id}/suspension`)
      .set('Cookie', cookie)
      .expect(204);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).estado).toBe(
      'ACTIVO',
    );
  });

  it('un administrador no puede suspenderse a sí mismo', async () => {
    const { admin, cookie } = await crearAdministrador();

    await servidor()
      .post(`/api/admin/usuarios/${admin.id}/suspension`)
      .set('Cookie', cookie)
      .send({ motivo: 'Prueba de autosuspensión' })
      .expect(409);
  });

  it('el último administrador activo no puede quitarse el rol', async () => {
    const { admin, totp, cookie } = await crearAdministrador();
    // Deja a este como único administrador activo (la base de pruebas no se limpia; research §17).
    await prisma.usuario.updateMany({
      where: { id: { not: admin.id }, roles: { has: 'ADMINISTRADOR' } },
      data: { estado: 'SUSPENDIDO' },
    });

    await servidor()
      .put(`/api/admin/usuarios/${admin.id}/roles`)
      .set('Cookie', cookie)
      .send({ roles: ['APOSTADOR'], codigo2fa: codigoTotp(totp) })
      .expect(409);
  });

  it('filtra la auditoría por usuario y acción', async () => {
    const { totp, cookie } = await crearAdministrador();
    const usuario = await crearUsuario(app);
    await servidor()
      .put(`/api/admin/usuarios/${usuario.id}/roles`)
      .set('Cookie', cookie)
      .send({ roles: ['APOSTADOR', 'OPERADOR'], codigo2fa: codigoTotp(totp) })
      .expect(200);

    const respuesta = await servidor()
      .get('/api/admin/auditoria')
      .query({ usuarioId: usuario.id, accion: 'usuario.' })
      .set('Cookie', cookie)
      .expect(200);

    expect(respuesta.body.items.map((e: { accion: string }) => e.accion)).toContain(
      'usuario.rol_cambiado',
    );
  });
});
