import { Prisma } from '../generated/prisma/client.js';

/** `true` si el error es una violación de una restricción única (P2002). */
export function esViolacionDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
