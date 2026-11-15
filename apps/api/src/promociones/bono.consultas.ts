import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { Bono } from '../generated/prisma/client.js';

type ClienteBono = Pick<ClienteTransaccional, 'bono' | '$executeRaw'>;

/**
 * Vencimiento perezoso (research.md §3): un bono ACTIVO con `venceEn ≤ ahora` pasa a VENCIDO al consultarlo o al
 * canjear, sin tarea programada. Su saldo de bono no se convierte. Un bono que ya alcanzó su requisito
 * (`avance ≥ requisito`) no vence: solo espera a que se liquiden las apuestas pagadas con saldo de bono.
 */
export async function vencerBonos(
  cliente: ClienteBono,
  usuarioId: string,
  ahora: Date,
): Promise<void> {
  await cliente.$executeRaw`
    UPDATE bono SET estado = 'VENCIDO'
    WHERE usuario_id = ${usuarioId} AND estado = 'ACTIVO' AND vence_en <= ${ahora} AND avance < requisito`;
}

/** El bono ACTIVO del usuario (a lo sumo uno, por el índice único parcial), ya aplicado el vencimiento. */
export async function buscarBonoActivo(
  cliente: ClienteBono,
  usuarioId: string,
  ahora: Date,
): Promise<Bono | null> {
  await vencerBonos(cliente, usuarioId, ahora);
  return cliente.bono.findFirst({ where: { usuarioId, estado: 'ACTIVO' } });
}
