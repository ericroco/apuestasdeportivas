import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ENTORNO, type Entorno } from '../src/config/env.js';
import {
  Publico,
  Roles,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../src/contracts/autenticacion.js';
import { PermiteSinSegundoFactor } from '../src/identidad/permite-sin-segundo-factor.decorator.js';
import { TokensService } from '../src/identidad/tokens.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearAppDePrueba } from './ayudas/app-prueba.js';
import { sesionDePrueba } from './ayudas/sesion-de-prueba.js';

@Controller('prueba-guard')
class ControladorGuard {
  @Get('libre')
  @Publico()
  libre(): { ok: true } {
    return { ok: true };
  }

  @Get('autenticada')
  autenticada(@UsuarioActual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }

  @Get('operador')
  @Roles('OPERADOR', 'ADMINISTRADOR')
  operador(): { ok: true } {
    return { ok: true };
  }

  @Get('administrador')
  @Roles('ADMINISTRADOR')
  administrador(): { ok: true } {
    return { ok: true };
  }

  @Get('activar-2fa')
  @PermiteSinSegundoFactor()
  activar(): { ok: true } {
    return { ok: true };
  }
}

// Contrato 1 y vector "escalada de rol": denegación por defecto, roles, revocación y alcance de 2FA.
describe('Guard global de autenticación y roles (e2e)', () => {
  let app: NestExpressApplication;
  const pedir = (ruta: string) => request(app.getHttpServer()).get(`/api/prueba-guard/${ruta}`);

  beforeAll(async () => {
    app = await crearAppDePrueba({ controladores: [ControladorGuard] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('deja pasar sin sesión solo las rutas @Publico', async () => {
    await pedir('libre').expect(200);
    await pedir('autenticada').expect(401);
  });

  it('acepta el token en la cookie `acceso` y en Authorization: Bearer y deja el usuario en la petición', async () => {
    const { cookie, token, usuario } = await sesionDePrueba(app);

    const porCookie = await pedir('autenticada').set('Cookie', cookie).expect(200);
    await pedir('autenticada').set('Authorization', `Bearer ${token}`).expect(200);
    expect(porCookie.body).toEqual(usuario);
  });

  it('rechaza un token inventado', async () => {
    await pedir('autenticada').set('Cookie', 'acceso=no.es.un-token').expect(401);
  });

  it('un apostador no entra a rutas de operador ni de administrador, y el intento queda auditado', async () => {
    const { cookie, usuario } = await sesionDePrueba(app, { roles: ['APOSTADOR'] });

    await pedir('operador').set('Cookie', cookie).expect(403);
    await pedir('administrador').set('Cookie', cookie).expect(403);

    const eventos = await app
      .get(PrismaService)
      .eventoAuditoria.findMany({ where: { actorId: usuario.id, accion: 'acceso.denegado' } });
    expect(eventos).toHaveLength(2);
  });

  it('con varios roles basta tener uno de los requeridos', async () => {
    const operador = await sesionDePrueba(app, { roles: ['APOSTADOR', 'OPERADOR'] });
    const administrador = await sesionDePrueba(app, { roles: ['ADMINISTRADOR'] });

    await pedir('operador').set('Cookie', operador.cookie).expect(200);
    await pedir('administrador').set('Cookie', operador.cookie).expect(403);
    await pedir('operador').set('Cookie', administrador.cookie).expect(200);
    await pedir('administrador').set('Cookie', administrador.cookie).expect(200);
  });

  it('un acceso revocado deja de servir de inmediato', async () => {
    const { cookie, usuario } = await sesionDePrueba(app);
    await pedir('autenticada').set('Cookie', cookie).expect(200);

    // La revocación compara segundos: se espera a que el token quede en un segundo anterior.
    await new Promise((resolver) => setTimeout(resolver, 1_100));
    await app.get(TokensService).revocarAccesosDe(usuario.id);

    await pedir('autenticada').set('Cookie', cookie).expect(401);
  });

  it('con alcance activar-2fa solo se permiten las rutas para activar el segundo factor', async () => {
    const { cookie } = await sesionDePrueba(app, {
      roles: ['OPERADOR'],
      alcance: 'activar-2fa',
    });

    await pedir('activar-2fa').set('Cookie', cookie).expect(200);
    await pedir('autenticada').set('Cookie', cookie).expect(403);
    await pedir('operador').set('Cookie', cookie).expect(403);
  });

  it('solo confía en la IP que informa el proxy de la web si trae el secreto correcto', async () => {
    const secreto = app.get<Entorno>(ENTORNO).WEB_PROXY_SECRETO;
    const prisma = app.get(PrismaService);
    const apostador = await sesionDePrueba(app);

    await pedir('operador')
      .set('Cookie', apostador.cookie)
      .set('x-proxy-secreto', secreto)
      .set('x-cliente-ip', '198.51.100.23')
      .expect(403);
    await pedir('operador')
      .set('Cookie', apostador.cookie)
      .set('x-proxy-secreto', 'secreto-falso-de-un-atacante-0000000')
      .set('x-cliente-ip', '198.51.100.99')
      .expect(403);

    const ips = (
      await prisma.eventoAuditoria.findMany({
        where: { actorId: apostador.usuario.id },
        orderBy: { creadoEn: 'asc' },
      })
    ).map((evento) => evento.ip);
    expect(ips[0]).toBe('198.51.100.23');
    expect(ips[1]).not.toBe('198.51.100.99');
  });
});
