import { randomUUID } from 'node:crypto';
import {
  SaldoInsuficienteError,
  type BilleteraPort,
  type ClienteTransaccional,
  type Monto,
  type OperacionApuesta,
  type OperacionBono,
  type ResultadoAsiento,
  type SaldosUsuario,
  type TipoSaldo,
} from '../../src/contracts/billetera.port.js';
import { Prisma } from '../../src/generated/prisma/client.js';

export type TipoOperacion = 'DEBITO_APUESTA' | 'PREMIO' | 'REEMBOLSO' | 'BONO' | 'CONVERSION';

export interface AsientoEnMemoria {
  readonly asientoId: string;
  readonly operacion: TipoOperacion;
  readonly usuarioId: string;
  readonly monto: Monto;
  readonly claveIdempotencia: string;
  readonly referencia?: string;
}

interface Movimiento {
  readonly real: Monto;
  readonly bono: Monto;
}

const CERO = new Prisma.Decimal(0);

function validarMonto(monto: Monto): void {
  if (!monto.isPositive() || monto.isZero() || monto.decimalPlaces() > 2) {
    throw new Error(`Monto inválido para la billetera: ${monto.toString()}`);
  }
}

function enTipo(tipoSaldo: TipoSaldo, monto: Monto): Movimiento {
  return tipoSaldo === 'REAL' ? { real: monto, bono: CERO } : { real: CERO, bono: monto };
}

/**
 * Doble en memoria de `BilleteraPort` (contrato 2) para las pruebas del Spec 4: saldos REAL y BONO por usuario e
 * idempotencia por clave. Ignora `tx`: no se revierte con la transacción de quien llama.
 */
export class BilleteraEnMemoria implements BilleteraPort {
  private readonly saldos = new Map<string, SaldosUsuario>();
  private readonly resultados = new Map<string, ResultadoAsiento>();
  private readonly registro: AsientoEnMemoria[] = [];

  get asientos(): readonly AsientoEnMemoria[] {
    return [...this.registro];
  }

  /** Vacía saldos, asientos y claves (entre pruebas que comparten la app). */
  reiniciar(): void {
    this.saldos.clear();
    this.resultados.clear();
    this.registro.length = 0;
  }

  fijarSaldos(usuarioId: string, saldos: { real?: string; bono?: string }): void {
    this.saldos.set(usuarioId, {
      real: new Prisma.Decimal(saldos.real ?? 0),
      bono: new Prisma.Decimal(saldos.bono ?? 0),
    });
  }

  async debitarApuesta(_tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    const { real, bono } = enTipo(op.tipoSaldo, op.monto);
    return this.mover('DEBITO_APUESTA', op, { real: real.negated(), bono: bono.negated() });
  }

  async acreditarPremio(
    _tx: ClienteTransaccional,
    op: OperacionApuesta,
  ): Promise<ResultadoAsiento> {
    return this.mover('PREMIO', op, enTipo(op.tipoSaldo, op.monto));
  }

  async reembolsarApuesta(
    _tx: ClienteTransaccional,
    op: OperacionApuesta,
  ): Promise<ResultadoAsiento> {
    return this.mover('REEMBOLSO', op, enTipo(op.tipoSaldo, op.monto));
  }

  async acreditarBono(_tx: ClienteTransaccional, op: OperacionBono): Promise<ResultadoAsiento> {
    return this.mover('BONO', op, enTipo('BONO', op.monto), op.referencia);
  }

  async convertirBonoEnReal(
    _tx: ClienteTransaccional,
    op: OperacionBono,
  ): Promise<ResultadoAsiento> {
    return this.mover(
      'CONVERSION',
      op,
      { real: op.monto, bono: op.monto.negated() },
      op.referencia,
    );
  }

  async obtenerSaldos(usuarioId: string): Promise<SaldosUsuario> {
    return this.saldos.get(usuarioId) ?? { real: CERO, bono: CERO };
  }

  private async mover(
    operacion: TipoOperacion,
    op: { usuarioId: string; monto: Monto; claveIdempotencia: string },
    movimiento: Movimiento,
    referencia?: string,
  ): Promise<ResultadoAsiento> {
    const previo = this.resultados.get(op.claveIdempotencia);
    if (previo) return { asientoId: previo.asientoId, creado: false };
    validarMonto(op.monto);
    const actual = await this.obtenerSaldos(op.usuarioId);
    const nuevo = {
      real: actual.real.plus(movimiento.real),
      bono: actual.bono.plus(movimiento.bono),
    };
    if (nuevo.real.isNegative() || nuevo.bono.isNegative()) {
      throw new SaldoInsuficienteError('Saldo insuficiente');
    }
    const asiento = { asientoId: randomUUID(), operacion, ...op, referencia };
    this.saldos.set(op.usuarioId, nuevo);
    this.registro.push(asiento);
    this.resultados.set(op.claveIdempotencia, { asientoId: asiento.asientoId, creado: true });
    return { asientoId: asiento.asientoId, creado: true };
  }
}
