import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { EVENTOS, type UsuarioRegistrado } from '../src/contracts/eventos.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import { correosPara, esperarCorreo, tokenDelCorreo } from './ayudas/mailpit.js';
import { sesionDePrueba } from './ayudas/sesion-de-prueba.js';

const CONTRASENA = 'Una-Clave-Segura-2026';

// HU1: registro con verificación de correo y mayoría de edad (FR-001 a FR-007, FR-066).
describe('Registro y verificación de correo (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  // Cada petición desde otra IP: el límite de 5 por minuto de las rutas públicas no debe cortar la prueba.
  let ip = 0;
  const post = (ruta: string) =>
    request(app.getHttpServer())
      .post(`/api/identidad/${ruta}`)
      .set('X-Forwarded-For', `198.51.100.${(ip = (ip % 250) + 1)}`);

  const datos = (cambios: Record<string, unknown> = {}) => ({
    nombreCompleto: 'Ana Prueba',
    email: `registro-${randomUUID()}@prueba.local`,
    contrasena: CONTRASENA,
    fechaNacimiento: '1995-06-15',
    declaraMayorEdad: true,
    captcha: 'token-de-prueba',
    ...cambios,
  });

  const proxyOriginal = process.env['TRUST_PROXY_HOPS'];

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

  it('crea la cuenta pendiente de verificación, solo apostador, con correo, auditoría y evento', async () => {
    const eventos: UsuarioRegistrado[] = [];
    app.get(EventEmitter2).on(EVENTOS.usuarioRegistrado, (e: UsuarioRegistrado) => eventos.push(e));
    const cuerpo = datos({ email: `  Registro-${randomUUID()}@Prueba.LOCAL ` });
    const email = cuerpo.email.trim().toLowerCase();

    await post('registro').send(cuerpo).expect(202);

    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    expect(usuario).toMatchObject({ estado: 'PENDIENTE_VERIFICACION', roles: ['APOSTADOR'] });
    expect(usuario.correoVerificadoEn).toBeNull();
    const credencial = await prisma.credencial.findUniqueOrThrow({
      where: { usuarioId: usuario.id },
    });
    expect(credencial.hashContrasena).toMatch(/^\$argon2id\$/);
    await esperarCorreo(email, 'Confirma tu correo');
    expect(eventos).toContainEqual(expect.objectContaining({ usuarioId: usuario.id }));
    const auditoria = await prisma.eventoAuditoria.findMany({ where: { entidadId: usuario.id } });
    expect(auditoria.map((e) => e.accion)).toContain('usuario.registrado');
  });

  it('rechaza a un menor de edad y a quien no declara la mayoría de edad', async () => {
    const hoy = new Date();
    const menor = `${hoy.getUTCFullYear() - 17}-01-01`;

    await post('registro')
      .send(datos({ fechaNacimiento: menor }))
      .expect(400);
    await post('registro')
      .send(datos({ declaraMayorEdad: false }))
      .expect(400);
  });

  it('acepta a quien cumple 18 años hoy (reloj del servidor)', async () => {
    const hoy = new Date();
    const fecha = `${hoy.getUTCFullYear() - 18}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}-${String(hoy.getUTCDate()).padStart(2, '0')}`;

    await post('registro')
      .send(datos({ fechaNacimiento: fecha }))
      .expect(202);
  });

  it('rechaza contraseñas cortas, comunes o que contienen el correo', async () => {
    await post('registro')
      .send(datos({ contrasena: 'corta123' }))
      .expect(400);
    await post('registro')
      .send(datos({ contrasena: 'password1234' }))
      .expect(400);
    await post('registro')
      .send(datos({ email: 'mariana.lopez@prueba.local', contrasena: 'mariana.lopez-2026!' }))
      .expect(400);
  });

  it('rechaza el registro sin CAPTCHA o con campos de más', async () => {
    await post('registro')
      .send(datos({ captcha: '' }))
      .expect(400);
    await post('registro')
      .send(datos({ roles: ['ADMINISTRADOR'] }))
      .expect(400);
  });

  it('con un correo ya registrado responde igual y solo envía un aviso al dueño (FR-005)', async () => {
    const cuerpo = datos();
    const primera = await post('registro').send(cuerpo).expect(202);
    const segunda = await post('registro')
      .send({ ...cuerpo, nombreCompleto: 'Otra Persona' })
      .expect(202);

    expect(segunda.body).toEqual(primera.body);
    await esperarCorreo(cuerpo.email, 'Ya tienes una cuenta');
    expect(await prisma.usuario.count({ where: { email: cuerpo.email } })).toBe(1);
  });

  it('dos registros simultáneos con el mismo correo crean una sola cuenta', async () => {
    const cuerpo = datos();

    const respuestas = await Promise.all([
      post('registro').send(cuerpo),
      post('registro').send(cuerpo),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([202, 202]);
    expect(await prisma.usuario.count({ where: { email: cuerpo.email } })).toBe(1);
  });

  it('el enlace verifica la cuenta una sola vez', async () => {
    const cuerpo = datos();
    await post('registro').send(cuerpo).expect(202);
    const token = tokenDelCorreo(await esperarCorreo(cuerpo.email, 'Confirma tu correo'));

    await post('correo/verificar').send({ token }).expect(200);
    await post('correo/verificar').send({ token }).expect(400);

    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: cuerpo.email } });
    expect(usuario.estado).toBe('ACTIVO');
    expect(usuario.correoVerificadoEn).not.toBeNull();
  });

  it('rechaza un enlace inventado', async () => {
    await post('correo/verificar')
      .send({ token: 'x'.repeat(43) })
      .expect(400);
  });

  it('permite pedir otro enlace como máximo 3 veces por hora', async () => {
    const cuerpo = datos();
    await post('registro').send(cuerpo).expect(202);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: cuerpo.email } });
    const { cookie } = await sesionDePrueba(app, { usuarioId: usuario.id, email: cuerpo.email });

    // El del registro cuenta como el primero.
    await post('correo/reenviar').set('Cookie', cookie).expect(202);
    await post('correo/reenviar').set('Cookie', cookie).expect(202);
    await post('correo/reenviar').set('Cookie', cookie).expect(429);
    await expect(correosPara(cuerpo.email)).resolves.toHaveLength(3);
  });
});
