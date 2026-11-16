import { randomUUID } from 'node:crypto';
import { Decimal } from '../../src/comun/decimal.js';
import {
  type BilleteraPort,
  type ClienteTransaccional,
  type OperacionApuesta,
  type OperacionBono,
  type ResultadoAsiento,
  SaldoInsuficienteError,
  type SaldosUsuario,
  type TipoSaldo,
} from '../../src/contracts/index.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

export type OperacionLedger =
  | 'DEPOSITO'
  | 'DEBITO_APUESTA'
  | 'PREMIO'
  | 'REEMBOLSO'
  | 'REVERSION_PREMIO'
  | 'BONO'
  | 'CONVERSION_BONO';

interface Movimiento {
  readonly usuarioId: string;
  readonly claveIdempotencia: string;
  readonly monto: Decimal;
  readonly referencia?: string;
}

/**
 * Doble de BilleteraPort para las pruebas (research.md §12). Escribe en el esquema `pruebas` con el cliente
 * transaccional de quien llama, así que participa en la misma transacción que la apuesta: si la apuesta falla,
 * el débito se revierte con ella. Bloquea la fila de la billetera con FOR UPDATE como exige el contrato.
 *
 * Incluye `revertirPremio`, la operación propuesta al Spec 2 en contracts/cambios-contratos.md.
 */
export class BilleteraSqlDePrueba implements BilleteraPort {
  constructor(private readonly prisma: PrismaService) {}

  /** Solo pruebas: abre la billetera y deposita saldo real (y opcionalmente de bono). */
  async depositar(usuarioId: string, real: string, bono = '0'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuarioId);
      const depositos: Array<[TipoSaldo, Decimal]> = [
        ['REAL', new Decimal(real)],
        ['BONO', new Decimal(bono)],
      ];
      for (const [tipoSaldo, monto] of depositos) {
        if (monto.greaterThan(0)) {
          await this.insertar(
            tx,
            usuarioId,
            'DEPOSITO',
            tipoSaldo,
            monto,
            `deposito:${randomUUID()}`,
          );
        }
      }
    });
  }

  debitarApuesta(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    return this.registrar(tx, aMovimiento(op), 'DEBITO_APUESTA', op.tipoSaldo, -1, true);
  }

  acreditarPremio(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    return this.registrar(tx, aMovimiento(op), 'PREMIO', op.tipoSaldo, 1, false);
  }

  reembolsarApuesta(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    return this.registrar(tx, aMovimiento(op), 'REEMBOLSO', op.tipoSaldo, 1, false);
  }

  /** Propuesta al Spec 2: no exige saldo, puede dejarlo negativo (FR-038). */
  revertirPremio(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    return this.registrar(tx, aMovimiento(op), 'REVERSION_PREMIO', op.tipoSaldo, -1, false);
  }

  acreditarBono(tx: ClienteTransaccional, op: OperacionBono): Promise<ResultadoAsiento> {
    return this.registrar(tx, op, 'BONO', 'BONO', 1, false);
  }

  async convertirBonoEnReal(
    tx: ClienteTransaccional,
    op: OperacionBono,
  ): Promise<ResultadoAsiento> {
    const salida = await this.registrar(tx, op, 'CONVERSION_BONO', 'BONO', -1, true);
    if (salida.creado) {
      const clave = `${op.claveIdempotencia}:real`;
      await this.insertar(
        tx,
        op.usuarioId,
        'CONVERSION_BONO',
        'REAL',
        op.monto,
        clave,
        op.referencia,
      );
    }
    return salida;
  }

  async obtenerSaldos(usuarioId: string, tx?: ClienteTransaccional): Promise<SaldosUsuario> {
    const cliente = tx ?? this.prisma;
    const filas = await cliente.$queryRaw<Array<{ tipo_saldo: TipoSaldo; total: string }>>`
      SELECT tipo_saldo, COALESCE(SUM(monto), 0)::text AS total
      FROM pruebas.asiento WHERE usuario_id = ${usuarioId} GROUP BY tipo_saldo`;
    const total = (tipo: TipoSaldo) =>
      new Decimal(filas.find((f) => f.tipo_saldo === tipo)?.total ?? 0);
    return { real: total('REAL'), bono: total('BONO') };
  }

  /** Solo pruebas: asientos de un usuario, para comprobar que no hubo pagos ni reembolsos duplicados. */
  async contarAsientos(usuarioId: string, operacion: OperacionLedger): Promise<number> {
    const filas = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM pruebas.asiento
      WHERE usuario_id = ${usuarioId} AND operacion = ${operacion}`;
    return filas[0]?.n ?? 0;
  }

  private async registrar(
    tx: ClienteTransaccional,
    movimiento: Movimiento,
    operacion: OperacionLedger,
    tipoSaldo: TipoSaldo,
    signo: 1 | -1,
    exigeSaldo: boolean,
  ): Promise<ResultadoAsiento> {
    if (!movimiento.monto.greaterThan(0)) {
      throw new Error('El monto de una operación de billetera debe ser positivo');
    }
    await this.bloquear(tx, movimiento.usuarioId);

    const existente = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM pruebas.asiento WHERE clave_idempotencia = ${movimiento.claveIdempotencia}`;
    if (existente[0]) return { asientoId: existente[0].id, creado: false };

    if (exigeSaldo) {
      const saldos = await this.obtenerSaldos(movimiento.usuarioId, tx);
      const disponible = tipoSaldo === 'REAL' ? saldos.real : saldos.bono;
      if (disponible.lessThan(movimiento.monto)) {
        throw new SaldoInsuficienteError(
          `Saldo ${tipoSaldo} insuficiente: disponible ${disponible.toFixed(2)}`,
        );
      }
    }
    const asientoId = await this.insertar(
      tx,
      movimiento.usuarioId,
      operacion,
      tipoSaldo,
      movimiento.monto.times(signo),
      movimiento.claveIdempotencia,
      movimiento.referencia,
    );
    return { asientoId, creado: true };
  }

  /** Crea la billetera si no existe y bloquea su fila hasta el final de la transacción. */
  private async bloquear(tx: ClienteTransaccional, usuarioId: string): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO pruebas.billetera (usuario_id) VALUES (${usuarioId}) ON CONFLICT DO NOTHING`;
    await tx.$queryRaw`
      SELECT usuario_id FROM pruebas.billetera WHERE usuario_id = ${usuarioId} FOR UPDATE`;
  }

  private async insertar(
    tx: ClienteTransaccional,
    usuarioId: string,
    operacion: OperacionLedger,
    tipoSaldo: TipoSaldo,
    monto: Decimal,
    clave: string,
    referencia?: string,
  ): Promise<string> {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pruebas.asiento (usuario_id, operacion, tipo_saldo, monto, clave_idempotencia, referencia)
      VALUES (${usuarioId}, ${operacion}, ${tipoSaldo}, ${monto.toFixed(2)}::numeric, ${clave},
              ${referencia ?? null})
      RETURNING id::text`;
    const id = filas[0]?.id;
    if (!id) throw new Error('No se pudo registrar el asiento de prueba');
    return id;
  }
}

function aMovimiento(op: OperacionApuesta): Movimiento {
  return { ...op, referencia: op.apuestaId };
}
