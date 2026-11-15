import type { NestExpressApplication } from '@nestjs/platform-express';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import {
  CONTRASENA_PRUEBA,
  cookiesDe,
  crearUsuario,
  generadorDeIps,
} from './ayudas/fabricas-identidad.js';

// HU6: segundo factor TOTP, códigos de recuperación y 2FA obligatorio para operador y administrador (FR-017 a FR-022).
describe('Segundo factor (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const ip = generadorDeIps();
  const proxyOriginal = process.env['TRUST_PROXY_HOPS'];
  const servidor = () => request(app.getHttpServer());
  const post = (ruta: string, cookie = '') =>
    servidor().post(`/api/identidad/${ruta}`).set('X-Forwarded-For', ip()).set('Cookie', cookie);

  const entrar = async (email: string) => {
    const respuesta = await post('sesion')
      .send({ email, contrasena: CONTRASENA_PRUEBA, captcha: 'token-de-prueba' })
      .expect(200);
    return { estado: respuesta.body.estado as string, cookies: cookiesDe(respuesta) };
  };

  /** Inicia sesión, activa el 2FA y devuelve el generador TOTP y los códigos de recuperación. */
  const activar2fa = async (email: string) => {
    const { cookies } = await entrar(email);
    const acceso = `acceso=${cookies.acceso?.valor}`;
    const activacion = await post('2fa/activacion', acceso).expect(201);
    expect(activacion.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const totp = OTPAuth.URI.parse(activacion.body.otpauthUrl as string) as OTPAuth.TOTP;
    const confirmacion = await post('2fa/activacion/confirmar', acceso)
      .send({ codigo: totp.generate() })
      .expect(200);
    return { totp, codigos: confirmacion.body.codigosRecuperacion as string[], confirmacion };
  };

  /** Código del periodo siguiente (aceptado por la ventana de ±1): el actual ya se gastó al activar. */
  const siguiente = (totp: OTPAuth.TOTP, periodos = 1) =>
    totp.generate({ timestamp: Date.now() + periodos * 30_000 });

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

  it('activa el 2FA con 10 códigos de recuperación y guarda el secreto cifrado', async () => {
    const usuario = await crearUsuario(app);

    const { codigos, totp } = await activar2fa(usuario.email);

    expect(codigos).toHaveLength(10);
    const factor = await prisma.segundoFactor.findUniqueOrThrow({
      where: { usuarioId: usuario.id },
    });
    expect(factor.activadoEn).not.toBeNull();
    expect(factor.secretoCifrado).not.toContain(totp.secret.base32);
    const guardados = await prisma.codigoRecuperacion.findMany({
      where: { usuarioId: usuario.id },
    });
    expect(guardados.map((c) => c.hashCodigo)).not.toContain(codigos[0]);
  });

  it('con 2FA activo, el inicio de sesión pide el código y un código no se puede usar dos veces', async () => {
    const usuario = await crearUsuario(app);
    const { totp } = await activar2fa(usuario.email);

    const primero = await entrar(usuario.email);
    expect(primero.estado).toBe('REQUIERE_2FA');
    expect(primero.cookies.acceso).toBeUndefined();
    const desafio = `desafio=${primero.cookies.desafio?.valor}`;
    const codigo = siguiente(totp);
    const completo = await post('sesion/2fa', desafio).send({ codigo }).expect(200);
    expect(cookiesDe(completo).acceso).toBeDefined();

    const segundo = await entrar(usuario.email);
    await post('sesion/2fa', `desafio=${segundo.cookies.desafio?.valor}`)
      .send({ codigo })
      .expect(401);
  });

  it('un código de recuperación sirve una sola vez', async () => {
    const usuario = await crearUsuario(app);
    const { codigos } = await activar2fa(usuario.email);
    const codigo = codigos[0]!;

    const uno = await entrar(usuario.email);
    await post('sesion/2fa', `desafio=${uno.cookies.desafio?.valor}`).send({ codigo }).expect(200);
    const dos = await entrar(usuario.email);
    await post('sesion/2fa', `desafio=${dos.cookies.desafio?.valor}`).send({ codigo }).expect(401);
  });

  it('5 códigos incorrectos bloquean la cuenta como la contraseña', async () => {
    const usuario = await crearUsuario(app);
    await activar2fa(usuario.email);
    const { cookies } = await entrar(usuario.email);
    const desafio = `desafio=${cookies.desafio?.valor}`;

    for (let i = 0; i < 5; i++) {
      await post('sesion/2fa', desafio).send({ codigo: '000000' }).expect(401);
    }

    await post('sesion/2fa', desafio).send({ codigo: '000000' }).expect(423);
  });

  it('el desafío 2FA no sirve como acceso', async () => {
    const usuario = await crearUsuario(app);
    await activar2fa(usuario.email);
    const { cookies } = await entrar(usuario.email);

    await servidor()
      .get('/api/identidad/yo')
      .set('Cookie', `acceso=${cookies.desafio?.valor}`)
      .expect(401);
  });

  it('desactivarlo exige un código válido; un operador no puede desactivarlo', async () => {
    const apostador = await crearUsuario(app);
    const { totp, confirmacion } = await activar2fa(apostador.email);
    const acceso = `acceso=${cookiesDe(confirmacion).acceso?.valor}`;
    await post('2fa/desactivar', acceso).send({ codigo: '123456' }).expect(400);
    await post('2fa/desactivar', acceso)
      .send({ codigo: siguiente(totp) })
      .expect(204);

    const operador = await crearUsuario(app, { roles: ['APOSTADOR', 'OPERADOR'] });
    const op = await activar2fa(operador.email);
    await post('2fa/desactivar', `acceso=${cookiesDe(op.confirmacion).acceso?.valor}`)
      .send({ codigo: siguiente(op.totp) })
      .expect(403);
  });

  it('un operador sin 2FA solo puede activarlo, y al activarlo recibe una sesión completa', async () => {
    const operador = await crearUsuario(app, { roles: ['APOSTADOR', 'OPERADOR'] });
    const { cookies } = await entrar(operador.email);
    const limitado = `acceso=${cookies.acceso?.valor}`;

    const yo = await servidor().get('/api/identidad/yo').set('Cookie', limitado).expect(200);
    expect(yo.body.alcance).toBe('activar-2fa');
    await post('correo/reenviar', limitado).expect(202);
    await post('2fa/desactivar', limitado).send({ codigo: '123456' }).expect(403);

    const activacion = await post('2fa/activacion', limitado).expect(201);
    const totp = OTPAuth.URI.parse(activacion.body.otpauthUrl as string) as OTPAuth.TOTP;
    const confirmacion = await post('2fa/activacion/confirmar', limitado)
      .send({ codigo: totp.generate() })
      .expect(200);

    const completo = `acceso=${cookiesDe(confirmacion).acceso?.valor}`;
    const despues = await servidor().get('/api/identidad/yo').set('Cookie', completo).expect(200);
    expect(despues.body).toMatchObject({ alcance: 'completo', tiene2fa: true });
  });
});
