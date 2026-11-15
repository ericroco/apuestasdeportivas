import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { Cupon } from '../generated/prisma/client.js';

/**
 * Bloquea la fila del cupón con `SELECT … FOR UPDATE` dentro de `tx` y la lee ya bloqueada. Serializa los canjes y
 * los cambios de un mismo cupón sin bloquear a los demás (research.md §1).
 */
async function leerBloqueado(
  tx: ClienteTransaccional,
  filas: ReadonlyArray<{ id: string }>,
): Promise<Cupon | null> {
  const fila = filas[0];
  return fila ? tx.cupon.findUnique({ where: { id: fila.id } }) : null;
}

/** `id` debe venir validado como uuid (el controlador lo valida). */
export async function bloquearCuponPorId(
  tx: ClienteTransaccional,
  id: string,
): Promise<Cupon | null> {
  const filas = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM cupon WHERE id = ${id}::uuid FOR UPDATE`;
  return leerBloqueado(tx, filas);
}

/** `codigo` debe venir normalizado (`normalizarCodigo`). */
export async function bloquearCuponPorCodigo(
  tx: ClienteTransaccional,
  codigo: string,
): Promise<Cupon | null> {
  const filas = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM cupon WHERE codigo = ${codigo} FOR UPDATE`;
  return leerBloqueado(tx, filas);
}
