/**
 * Puerto de billetera y ledger.
 * Provee: Spec 2 (Ricardo). Consumen: Spec 3 (apuestas, liquidación, reembolsos) y Spec 4 (bonos, rollover).
 *
 * Reglas del contrato (constitución, principio II; docs/equipo/contratos.md §2):
 * - Todo movimiento es un asiento de doble entrada en el ledger; nunca se actualiza un saldo directamente.
 * - Las operaciones que mueven dinero reciben el cliente transaccional `tx` de quien llama: así el Spec 3
 *   descuenta saldo y crea la apuesta en la misma transacción. La implementación bloquea la fila de la
 *   billetera (`SELECT … FOR UPDATE`) dentro de `tx`.
 * - `claveIdempotencia` es única por operación: repetir la llamada con la misma clave no crea otro asiento
 *   y devuelve el mismo resultado.
 * - Los montos son `Decimal` (nunca `number`) y siempre positivos; el sentido lo da la operación.
 */
import type { Prisma } from '../generated/prisma/client.js';

export type ClienteTransaccional = Prisma.TransactionClient;

export type Monto = Prisma.Decimal;

/** Cuenta del usuario de la que sale o a la que entra el dinero. */
export type TipoSaldo = 'REAL' | 'BONO';

export interface SaldosUsuario {
  readonly real: Monto;
  readonly bono: Monto;
}

interface OperacionBilletera {
  readonly usuarioId: string;
  readonly monto: Monto;
  readonly claveIdempotencia: string;
}

export interface OperacionApuesta extends OperacionBilletera {
  readonly apuestaId: string;
  readonly tipoSaldo: TipoSaldo;
}

export interface OperacionBono extends OperacionBilletera {
  /** Cupón o promoción que origina el movimiento (Spec 4). */
  readonly referencia: string;
}

export interface ResultadoAsiento {
  readonly asientoId: string;
  /** `false` si la clave de idempotencia ya existía y no se creó un asiento nuevo. */
  readonly creado: boolean;
}

export interface BilleteraPort {
  /** Descuenta el monto apostado. Lanza `SaldoInsuficienteError` si no alcanza. */
  debitarApuesta(tx: ClienteTransaccional, operacion: OperacionApuesta): Promise<ResultadoAsiento>;
  /** Acredita el premio de una apuesta ganada al mismo tipo de saldo con que se apostó. */
  acreditarPremio(tx: ClienteTransaccional, operacion: OperacionApuesta): Promise<ResultadoAsiento>;
  /** Devuelve el monto de una apuesta anulada (partido cancelado o aplazado fuera de plazo). */
  reembolsarApuesta(
    tx: ClienteTransaccional,
    operacion: OperacionApuesta,
  ): Promise<ResultadoAsiento>;
  /** Acredita saldo de bono (bono de depósito, apuesta gratis). */
  acreditarBono(tx: ClienteTransaccional, operacion: OperacionBono): Promise<ResultadoAsiento>;
  /** Pasa saldo de bono a saldo real cuando se cumple el rollover. */
  convertirBonoEnReal(
    tx: ClienteTransaccional,
    operacion: OperacionBono,
  ): Promise<ResultadoAsiento>;
  /** Saldos derivados del ledger. */
  obtenerSaldos(usuarioId: string, tx?: ClienteTransaccional): Promise<SaldosUsuario>;
}

export const BILLETERA_PORT = Symbol('BILLETERA_PORT');

export class SaldoInsuficienteError extends Error {
  override readonly name = 'SaldoInsuficienteError';
}
