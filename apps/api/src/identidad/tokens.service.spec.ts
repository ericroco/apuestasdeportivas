import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { SignJWT, importPKCS8 } from 'jose';
import { validarEntorno } from '../config/env.js';
import { AUDIENCIA, EMISOR, TokenInvalidoError, TokensService } from './tokens.service.js';

// Vector "robo o falsificación de sesión": el token solo vale si lo firmó la API, para la audiencia correcta.
function claves() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privada: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publica: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const PROPIAS = claves();
const AJENAS = claves();

function entorno() {
  return validarEntorno({
    DATABASE_URL: 'postgresql://a:b@localhost:5432/x',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'http://localhost:3000',
    JWT_PRIVATE_KEY: PROPIAS.privada,
    JWT_PUBLIC_KEY: PROPIAS.publica,
    TOTP_CLAVE_CIFRADO: randomBytes(32).toString('base64'),
    TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
    WEB_PROXY_SECRETO: 'x'.repeat(32),
  });
}

function redisEnMemoria(): Redis {
  const datos = new Map<string, string>();
  return {
    get: vi.fn((clave: string) => Promise.resolve(datos.get(clave) ?? null)),
    set: vi.fn((clave: string, valor: string) => {
      datos.set(clave, valor);
      return Promise.resolve('OK');
    }),
  } as unknown as Redis;
}

const USUARIO = { id: randomUUID(), email: 'ana@prueba.local', roles: ['APOSTADOR'] as const };

describe('TokensService', () => {
  const servicio = new TokensService(entorno(), redisEnMemoria());
  const acceso = () =>
    servicio.emitirAcceso({ usuario: USUARIO, sesionId: randomUUID(), alcance: 'completo' });

  it('emite un acceso con las claims del contrato 6 y lo verifica', async () => {
    const verificado = await servicio.verificarAcceso(await acceso());

    expect(verificado.usuario).toEqual({ ...USUARIO, roles: ['APOSTADOR'] });
    expect(verificado.alcance).toBe('completo');
  });

  it('rechaza un token firmado con otra clave', async () => {
    const falso = await new SignJWT({
      email: USUARIO.email,
      roles: ['ADMINISTRADOR'],
      sid: randomUUID(),
      alc: 'completo',
    })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(USUARIO.id)
      .setIssuer(EMISOR)
      .setAudience(AUDIENCIA)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(await importPKCS8(AJENAS.privada, 'EdDSA'));

    await expect(servicio.verificarAcceso(falso)).rejects.toThrow(TokenInvalidoError);
  });

  it('rechaza un token con la firma alterada', async () => {
    const token = await acceso();
    const alterado = `${token.slice(0, -4)}${token.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;

    await expect(servicio.verificarAcceso(alterado)).rejects.toThrow(TokenInvalidoError);
  });

  it('no acepta el desafío 2FA como acceso ni el acceso como desafío', async () => {
    const desafio = await servicio.emitirDesafio2fa(USUARIO.id);

    await expect(servicio.verificarAcceso(desafio)).rejects.toThrow(TokenInvalidoError);
    await expect(servicio.verificarDesafio2fa(await acceso())).rejects.toThrow(TokenInvalidoError);
    await expect(servicio.verificarDesafio2fa(desafio)).resolves.toBe(USUARIO.id);
  });

  it('revoca los accesos anteriores pero no los emitidos en el mismo segundo', async () => {
    const verificado = await servicio.verificarAcceso(await acceso());
    await servicio.revocarAccesosDe(USUARIO.id);

    await expect(servicio.estaRevocado(USUARIO.id, verificado.emitidoEn - 1)).resolves.toBe(true);
    await expect(servicio.estaRevocado(USUARIO.id, Math.floor(Date.now() / 1000))).resolves.toBe(
      false,
    );
  });
});
