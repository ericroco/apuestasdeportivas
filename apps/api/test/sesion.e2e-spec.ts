import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import {
  CONTRASENA_PRUEBA,
  cookiesDe,
  crearUsuario,
  generadorDeIps,
} from './ayudas/fabricas-identidad.js';
import { esperarCorreo, tokenDelCorreo } from './ayudas/mailpit.js';

// HU2 y FR-067: inicio de sesión, fuerza bruta, renovación rotativa, reutilización, cierre y recuperación.
describe('Sesión y recuperación de contraseña (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const ip = generadorDeIps();
  const proxyOriginal = process.env['TRUST_PROXY_HOPS'];

  const post = (ruta: string) =>
    request(app.getHttpServer()).post(`/api/identidad/${ruta}`).set('X-Forwarded-For', ip());
  const entrar = (email: string, contrasena = CONTRASENA_PRUEBA) =>
    post('sesion').send({ email, contrasena, captcha: 'token-de-prueba' });

  beforeAll(async () => {
    process.env['TRUST_PROXY_HOPS'] = '1';
    app = await crearAppDePrueba();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    if (proxyOriginal === undefined) delete process.env['TRUST_PROXY_HOPS'];
    else process.env['TRUST_PROXY_HOPS'] = proxyOriginal;
  });

  it('inicia sesión con cookies httpOnly y la renovación limitada a las rutas de sesión', async () => {
    const usuario = await crearUsuario(app);

    const respuesta = await entrar(usuario.email).expect(200);

    expect(respuesta.body).toEqual({ estado: 'INICIADA' });
    const { acceso, renovacion } = cookiesDe(respuesta);
    expect(acceso?.atributos).toMatch(/HttpOnly/i);
    expect(acceso?.atributos).toMatch(/SameSite=Lax/i);
    expect(renovacion?.atributos).toMatch(/Path=\/api\/identidad\/sesion/i);
    const yo = await request(app.getHttpServer())
      .get('/api/identidad/yo')
      .set('Cookie', `acceso=${acceso?.valor}`)
      .expect(200);
    expect(yo.body).toMatchObject({
      id: usuario.id,
      verificado: true,
      tiene2fa: false,
      alcance: 'completo',
    });
  });

  it('responde el mismo mensaje con correo inexistente o contraseña incorrecta', async () => {
    const usuario = await crearUsuario(app);

    const inexistente = await entrar('nadie-con-este-correo@prueba.local').expect(401);
    const incorrecta = await entrar(usuario.email, 'Otra-Clave-Distinta-1').expect(401);

    expect(inexistente.body.message).toBe(incorrecta.body.message);
  });

  it('bloquea la cuenta 15 minutos tras 5 fallos, aun con la contraseña correcta, y lo audita', async () => {
    const usuario = await crearUsuario(app);
    for (let i = 0; i < 5; i++) await entrar(usuario.email, `Clave-Incorrecta-${i}x`).expect(401);

    await entrar(usuario.email).expect(423);

    const bloqueado = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(bloqueado.bloqueadoHasta!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    const acciones = (
      await prisma.eventoAuditoria.findMany({ where: { entidadId: usuario.id } })
    ).map((e) => e.accion);
    expect(acciones).toContain('usuario.bloqueado');
  });

  it('un inicio correcto reinicia el contador de fallos', async () => {
    const usuario = await crearUsuario(app);
    for (let i = 0; i < 4; i++) await entrar(usuario.email, `Clave-Incorrecta-${i}x`).expect(401);
    await entrar(usuario.email).expect(200);
    for (let i = 0; i < 4; i++) await entrar(usuario.email, `Clave-Incorrecta-${i}y`).expect(401);

    await entrar(usuario.email).expect(200);
  });

  it('rechaza a una cuenta suspendida', async () => {
    const usuario = await crearUsuario(app);
    await prisma.usuario.update({ where: { id: usuario.id }, data: { estado: 'SUSPENDIDO' } });

    await entrar(usuario.email).expect(403);
  });

  it('la renovación rota la credencial y la anterior ya no sirve', async () => {
    const usuario = await crearUsuario(app);
    const inicial = cookiesDe(await entrar(usuario.email).expect(200));

    const renovada = await post('sesion/renovar')
      .set('Cookie', `renovacion=${inicial.renovacion?.valor}`)
      .expect(204);
    const nuevas = cookiesDe(renovada);
    expect(nuevas.renovacion?.valor).not.toBe(inicial.renovacion?.valor);

    // Dentro de la ventana de 10 s se trata como otra pestaña: 409 sin revocar nada.
    await post('sesion/renovar')
      .set('Cookie', `renovacion=${inicial.renovacion?.valor}`)
      .expect(409);
    await post('sesion/renovar')
      .set('Cookie', `renovacion=${nuevas.renovacion?.valor}`)
      .expect(204);
  });

  it('reutilizar una renovación vieja cierra todas las sesiones del usuario (posible robo)', async () => {
    const usuario = await crearUsuario(app);
    const robada = cookiesDe(await entrar(usuario.email).expect(200)).renovacion!.valor;
    const legitima = cookiesDe(
      await post('sesion/renovar').set('Cookie', `renovacion=${robada}`).expect(204),
    ).renovacion!.valor;
    // Se simula que la credencial robada se usó hace más de 10 s.
    await prisma.sesion.updateMany({
      where: { usuarioId: usuario.id, usadaEn: { not: null } },
      data: { usadaEn: new Date(Date.now() - 60_000) },
    });

    await post('sesion/renovar').set('Cookie', `renovacion=${robada}`).expect(401);

    await post('sesion/renovar').set('Cookie', `renovacion=${legitima}`).expect(401);
    const acciones = (
      await prisma.eventoAuditoria.findMany({ where: { entidadId: usuario.id } })
    ).map((e) => e.accion);
    expect(acciones).toContain('sesion.reutilizacion_detectada');
  });

  it('cerrar sesión invalida la renovación de ese dispositivo', async () => {
    const usuario = await crearUsuario(app);
    const cookies = cookiesDe(await entrar(usuario.email).expect(200));

    await post('sesion/cerrar').set('Cookie', `acceso=${cookies.acceso?.valor}`).expect(204);

    await post('sesion/renovar')
      .set('Cookie', `renovacion=${cookies.renovacion?.valor}`)
      .expect(401);
  });

  it('recupera la contraseña con un enlace de un solo uso que cierra las sesiones abiertas', async () => {
    const usuario = await crearUsuario(app);
    const anterior = cookiesDe(await entrar(usuario.email).expect(200));
    const inexistente = await post('contrasena/olvido')
      .send({ email: 'nadie-aqui@prueba.local', captcha: 'token-de-prueba' })
      .expect(202);
    const existente = await post('contrasena/olvido')
      .send({ email: usuario.email, captcha: 'token-de-prueba' })
      .expect(202);
    expect(existente.body).toEqual(inexistente.body);
    const token = tokenDelCorreo(await esperarCorreo(usuario.email, 'Cambia tu contraseña'));

    await post('contrasena/restablecer').send({ token, contrasena: 'corta' }).expect(400);
    await post('contrasena/restablecer')
      .send({ token, contrasena: 'Nueva-Clave-Segura-77' })
      .expect(204);
    await post('contrasena/restablecer')
      .send({ token, contrasena: 'Otra-Clave-Segura-88' })
      .expect(400);

    await post('sesion/renovar')
      .set('Cookie', `renovacion=${anterior.renovacion?.valor}`)
      .expect(401);
    await entrar(usuario.email).expect(401);
    await entrar(usuario.email, 'Nueva-Clave-Segura-77').expect(200);
  });
});
