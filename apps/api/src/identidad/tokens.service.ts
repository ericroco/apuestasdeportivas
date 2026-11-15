import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey } from 'jose';
import { z } from 'zod';
import { ENTORNO, type Entorno } from '../config/env.js';
import { ROLES, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import { REDIS } from '../redis/redis.constants.js';

/** Claims del contrato 6. */
export const EMISOR = 'apuestas-api';
export const AUDIENCIA = 'apuestas';
/** Audiencia propia del desafío 2FA: así nunca sirve como token de acceso, ni al revés. */
const AUDIENCIA_DESAFIO = 'apuestas-desafio-2fa';
const VIDA_DESAFIO_S = 5 * 60;
const ALGORITMO = 'EdDSA';

/** `completo` = sesión normal; `activar-2fa` = operador o administrador que aún no activa el 2FA (FR-021). */
export type Alcance = 'completo' | 'activar-2fa';

export interface DatosAcceso {
  readonly usuario: UsuarioAutenticado;
  readonly sesionId: string;
  readonly alcance: Alcance;
}

export interface AccesoVerificado extends DatosAcceso {
  /** Segundos desde la época, para compararlo con la revocación. */
  readonly emitidoEn: number;
}

export class TokenInvalidoError extends Error {
  override readonly name = 'TokenInvalidoError';
}

const esquemaAcceso = z.object({
  sub: z.uuid(),
  email: z.email(),
  roles: z.array(z.enum(ROLES)).min(1),
  sid: z.uuid(),
  alc: z.enum(['completo', 'activar-2fa']),
  iat: z.number().int(),
});

const claveRevocacion = (usuarioId: string): string => `identidad:revocado-antes:${usuarioId}`;

/**
 * Emite y verifica los JWT EdDSA del contrato 6 y el desafío del segundo factor, y guarda en Redis la
 * revocación inmediata de los accesos de un usuario (research §2).
 */
@Injectable()
export class TokensService {
  private readonly privada: Promise<CryptoKey>;
  private readonly publica: Promise<CryptoKey>;

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.privada = importPKCS8(entorno.JWT_PRIVATE_KEY, ALGORITMO);
    this.publica = importSPKI(entorno.JWT_PUBLIC_KEY, ALGORITMO);
  }

  async emitirAcceso({ usuario, sesionId, alcance }: DatosAcceso): Promise<string> {
    return new SignJWT({
      email: usuario.email,
      roles: [...usuario.roles],
      sid: sesionId,
      alc: alcance,
    })
      .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
      .setSubject(usuario.id)
      .setIssuer(EMISOR)
      .setAudience(AUDIENCIA)
      .setIssuedAt()
      .setExpirationTime(`${this.entorno.JWT_ACCESS_TTL}s`)
      .sign(await this.privada);
  }

  async verificarAcceso(token: string): Promise<AccesoVerificado> {
    let claims: unknown;
    try {
      ({ payload: claims } = await jwtVerify(token, await this.publica, {
        issuer: EMISOR,
        audience: AUDIENCIA,
        algorithms: [ALGORITMO],
        typ: 'JWT',
      }));
    } catch {
      throw new TokenInvalidoError('Token de acceso inválido o caducado');
    }
    const datos = esquemaAcceso.safeParse(claims);
    if (!datos.success) throw new TokenInvalidoError('Token de acceso con claims inválidas');
    const { sub, email, roles, sid, alc, iat } = datos.data;
    return { usuario: { id: sub, email, roles }, sesionId: sid, alcance: alc, emitidoEn: iat };
  }

  async emitirDesafio2fa(usuarioId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
      .setSubject(usuarioId)
      .setIssuer(EMISOR)
      .setAudience(AUDIENCIA_DESAFIO)
      .setIssuedAt()
      .setExpirationTime(`${VIDA_DESAFIO_S}s`)
      .sign(await this.privada);
  }

  /** Devuelve el id del usuario del desafío, o lanza si no es un desafío válido y vigente. */
  async verificarDesafio2fa(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, await this.publica, {
        issuer: EMISOR,
        audience: AUDIENCIA_DESAFIO,
        algorithms: [ALGORITMO],
      });
      return z.uuid().parse(payload.sub);
    } catch {
      throw new TokenInvalidoError('Desafío de segundo factor inválido o caducado');
    }
  }

  /** Invalida desde ya todos los accesos emitidos antes de este segundo (suspensión, contraseña, roles). */
  async revocarAccesosDe(usuarioId: string): Promise<void> {
    const ahora = Math.floor(Date.now() / 1000);
    await this.redis.set(
      claveRevocacion(usuarioId),
      String(ahora),
      'EX',
      this.entorno.JWT_ACCESS_TTL,
    );
  }

  /** Un token emitido en el mismo segundo que la revocación sigue sirviendo (research §2). */
  async estaRevocado(usuarioId: string, emitidoEn: number): Promise<boolean> {
    const valor = await this.redis.get(claveRevocacion(usuarioId));
    return valor !== null && emitidoEn < Number(valor);
  }
}
