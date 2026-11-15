import { Injectable } from '@nestjs/common';
import {
  type ClienteTransaccional,
  ConflictoIdempotenciaError,
  type ResultadoAsiento,
  SaldoInsuficienteError,
  type SaldosUsuario,
  type TipoSaldo,
} from '../contracts/billetera.port.js';
import { Prisma, type TipoAsiento } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const CUENTA_CASA = 'casa';
export const CUENTA_PASARELA = 'pasarela';
export const CUENTA_RETIROS_TRANSITO = 'retiros_transito';
export const cuentaUsuario = (usuarioId: string, tipo: TipoSaldo): string =>
  `usuario:${usuarioId}:${tipo === 'REAL' ? 'real' : 'bono'}`;

export interface MovimientoContable {
  /** Código de la cuenta (`casa`, `usuario:<id>:real`…). */
  readonly cuenta: string;
  /** Con signo: positivo sube la cuenta. Los movimientos de un asiento suman cero. */
  readonly monto: Prisma.Decimal;
}

export interface NuevoAsiento {
  readonly usuarioId: string;
  readonly tipo: TipoAsiento;
  readonly claveIdempotencia: string;
  readonly origenTipo: string;
  readonly origenId: string;
  readonly movimientos: readonly MovimientoContable[];
  /** Cuenta del usuario que no puede quedar negativa con este asiento (todas salvo la reversión de premio). */
  readonly sinSaldoNegativoEn?: string;
}

/** Monto de una operación: Decimal positivo con 2 decimales como máximo (FR-042). */
export function validarMonto(monto: Prisma.Decimal): Prisma.Decimal {
  if (
    !Prisma.Decimal.isDecimal(monto) ||
    !monto.isFinite() ||
    monto.lte(0) ||
    monto.decimalPlaces() > 2
  ) {
    throw new RangeError('El monto debe ser positivo y tener como máximo 2 decimales');
  }
  return monto;
}

/**
 * Único punto que escribe en el libro contable (research §8). Dentro del `tx` de quien llama: bloquea la billetera
 * del usuario, resuelve la idempotencia, comprueba el saldo e inserta el asiento con sus líneas.
 */
@Injectable()
export class LibroContableService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(tx: ClienteTransaccional, asiento: NuevoAsiento): Promise<ResultadoAsiento> {
    await this.bloquearBilletera(tx, asiento.usuarioId);

    const existente = await tx.asiento.findUnique({
      where: { claveIdempotencia: asiento.claveIdempotencia },
      include: { lineas: true },
    });
    if (existente) {
      const mismo =
        existente.usuarioId === asiento.usuarioId &&
        existente.tipo === asiento.tipo &&
        sumaPositiva(existente.lineas.map((l) => l.monto)).eq(
          sumaPositiva(asiento.movimientos.map((m) => m.monto)),
        );
      if (!mismo) {
        throw new ConflictoIdempotenciaError(
          `La clave ${asiento.claveIdempotencia} ya se usó con otros datos`,
        );
      }
      return { asientoId: existente.id, creado: false };
    }

    if (asiento.sinSaldoNegativoEn) {
      const cuenta = asiento.sinSaldoNegativoEn;
      const cambio = asiento.movimientos
        .filter((m) => m.cuenta === cuenta)
        .reduce((total, m) => total.plus(m.monto), new Prisma.Decimal(0));
      if ((await this.saldoDe(tx, cuenta)).plus(cambio).lt(0)) {
        throw new SaldoInsuficienteError('Saldo insuficiente');
      }
    }

    const cuentas = await tx.cuentaContable.findMany({
      where: { codigo: { in: asiento.movimientos.map((m) => m.cuenta) } },
    });
    const idPorCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
    const creado = await tx.asiento.create({
      data: {
        tipo: asiento.tipo,
        claveIdempotencia: asiento.claveIdempotencia,
        usuarioId: asiento.usuarioId,
        origenTipo: asiento.origenTipo,
        origenId: asiento.origenId,
        lineas: {
          create: asiento.movimientos.map((m) => {
            const cuentaId = idPorCodigo.get(m.cuenta);
            if (!cuentaId) throw new Error(`No existe la cuenta contable ${m.cuenta}`);
            return { cuentaId, monto: m.monto };
          }),
        },
      },
    });
    return { asientoId: creado.id, creado: true };
  }

  /** Saldos derivados de las líneas (FR-035). Sin `tx`, lectura directa sin bloqueo. */
  async obtenerSaldos(
    usuarioId: string,
    tx: ClienteTransaccional = this.prisma,
  ): Promise<SaldosUsuario> {
    const [real, bono] = await Promise.all([
      this.saldoDe(tx, cuentaUsuario(usuarioId, 'REAL')),
      this.saldoDe(tx, cuentaUsuario(usuarioId, 'BONO')),
    ]);
    return { real, bono };
  }

  /**
   * Crea la billetera y las cuentas del usuario si no existen y bloquea su fila: las operaciones de dinero de un
   * mismo usuario se serializan (FR-039). Con READ COMMITTED, tras el bloqueo se ve lo confirmado antes.
   */
  async bloquearBilletera(tx: ClienteTransaccional, usuarioId: string): Promise<void> {
    await tx.$executeRaw`INSERT INTO billetera (usuario_id) VALUES (${usuarioId}::uuid) ON CONFLICT DO NOTHING`;
    await tx.$queryRaw`SELECT usuario_id FROM billetera WHERE usuario_id = ${usuarioId}::uuid FOR UPDATE`;
    await tx.cuentaContable.createMany({
      data: [
        { codigo: cuentaUsuario(usuarioId, 'REAL'), tipo: 'USUARIO_REAL', usuarioId },
        { codigo: cuentaUsuario(usuarioId, 'BONO'), tipo: 'USUARIO_BONO', usuarioId },
      ],
      skipDuplicates: true,
    });
  }

  private async saldoDe(tx: ClienteTransaccional, codigo: string): Promise<Prisma.Decimal> {
    const { _sum } = await tx.lineaAsiento.aggregate({
      _sum: { monto: true },
      where: { cuenta: { codigo } },
    });
    return _sum.monto ?? new Prisma.Decimal(0);
  }
}

function sumaPositiva(montos: readonly Prisma.Decimal[]): Prisma.Decimal {
  return montos.filter((m) => m.gt(0)).reduce((total, m) => total.plus(m), new Prisma.Decimal(0));
}
