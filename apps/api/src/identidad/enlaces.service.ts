import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { PropositoEnlace } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Vida de cada tipo de enlace (FR-004, FR-067). */
const VIDA_MS: Record<PropositoEnlace, number> = {
  VERIFICACION_CORREO: 24 * 60 * 60 * 1000,
  RECUPERACION_CONTRASENA: 60 * 60 * 1000,
};

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Enlaces de un solo uso enviados por correo. En la base solo queda el SHA-256 del token. */
@Injectable()
export class EnlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(
    usuarioId: string,
    proposito: PropositoEnlace,
    tx: ClienteTransaccional = this.prisma,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await tx.enlaceCorreo.create({
      data: {
        usuarioId,
        proposito,
        hashToken: hashToken(token),
        expiraEn: new Date(Date.now() + VIDA_MS[proposito]),
      },
    });
    return token;
  }

  /**
   * Marca el enlace como usado y devuelve su usuario, o `null` si no existe, venció o ya se usó. El UPDATE
   * condicional garantiza un solo uso aunque lleguen dos peticiones a la vez.
   */
  async consumir(
    token: string,
    proposito: PropositoEnlace,
    tx: ClienteTransaccional = this.prisma,
  ): Promise<string | null> {
    const hash = hashToken(token);
    const { count } = await tx.enlaceCorreo.updateMany({
      where: { hashToken: hash, proposito, usadoEn: null, expiraEn: { gt: new Date() } },
      data: { usadoEn: new Date() },
    });
    if (count !== 1) return null;
    const enlace = await tx.enlaceCorreo.findUnique({ where: { hashToken: hash } });
    return enlace?.usuarioId ?? null;
  }

  contarRecientes(usuarioId: string, proposito: PropositoEnlace, desde: Date): Promise<number> {
    return this.prisma.enlaceCorreo.count({
      where: { usuarioId, proposito, creadoEn: { gte: desde } },
    });
  }
}
