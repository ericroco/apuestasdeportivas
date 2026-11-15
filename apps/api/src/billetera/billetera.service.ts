import { Injectable } from '@nestjs/common';
import {
  type BilleteraPort,
  type ClienteTransaccional,
  type OperacionApuesta,
  type OperacionBono,
  type ResultadoAsiento,
  type SaldosUsuario,
  UsuarioNoHabilitadoError,
} from '../contracts/billetera.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CUENTA_CASA,
  cuentaUsuario,
  LibroContableService,
  validarMonto,
} from './libro-contable.service.js';

/** Implementación de BILLETERA_PORT (contrato 2) sobre el libro contable. Las claves las elige quien llama. */
@Injectable()
export class BilleteraService implements BilleteraPort {
  constructor(
    private readonly libro: LibroContableService,
    private readonly prisma: PrismaService,
  ) {}

  debitarApuesta(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    const cuenta = cuentaUsuario(op.usuarioId, op.tipoSaldo);
    const monto = validarMonto(op.monto);
    return this.libro.registrar(tx, {
      usuarioId: op.usuarioId,
      tipo: 'APUESTA',
      claveIdempotencia: op.claveIdempotencia,
      origenTipo: 'apuesta',
      origenId: op.apuestaId,
      movimientos: [
        { cuenta, monto: monto.neg() },
        { cuenta: CUENTA_CASA, monto },
      ],
      sinSaldoNegativoEn: cuenta,
    });
  }

  acreditarPremio(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    return this.deCasaAUsuario(tx, op, 'PREMIO');
  }

  reembolsarApuesta(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    return this.deCasaAUsuario(tx, op, 'REEMBOLSO');
  }

  /** Única operación que puede dejar el saldo negativo (aclaración del 2026-11-15). */
  revertirPremio(tx: ClienteTransaccional, op: OperacionApuesta): Promise<ResultadoAsiento> {
    const monto = validarMonto(op.monto);
    return this.libro.registrar(tx, {
      usuarioId: op.usuarioId,
      tipo: 'REVERSION_PREMIO',
      claveIdempotencia: op.claveIdempotencia,
      origenTipo: 'apuesta',
      origenId: op.apuestaId,
      movimientos: [
        { cuenta: cuentaUsuario(op.usuarioId, op.tipoSaldo), monto: monto.neg() },
        { cuenta: CUENTA_CASA, monto },
      ],
    });
  }

  async acreditarBono(tx: ClienteTransaccional, op: OperacionBono): Promise<ResultadoAsiento> {
    const monto = validarMonto(op.monto);
    const usuario = await tx.usuario.findUnique({ where: { id: op.usuarioId } });
    if (!usuario?.correoVerificadoEn || usuario.estado === 'SUSPENDIDO') {
      throw new UsuarioNoHabilitadoError(
        'El usuario no puede recibir bonos (sin verificar o suspendido)',
      );
    }
    return this.libro.registrar(tx, {
      usuarioId: op.usuarioId,
      tipo: 'BONO',
      claveIdempotencia: op.claveIdempotencia,
      origenTipo: 'promocion',
      origenId: op.referencia,
      movimientos: [
        { cuenta: CUENTA_CASA, monto: monto.neg() },
        { cuenta: cuentaUsuario(op.usuarioId, 'BONO'), monto },
      ],
    });
  }

  convertirBonoEnReal(tx: ClienteTransaccional, op: OperacionBono): Promise<ResultadoAsiento> {
    const monto = validarMonto(op.monto);
    const bono = cuentaUsuario(op.usuarioId, 'BONO');
    return this.libro.registrar(tx, {
      usuarioId: op.usuarioId,
      tipo: 'CONVERSION_BONO',
      claveIdempotencia: op.claveIdempotencia,
      origenTipo: 'promocion',
      origenId: op.referencia,
      movimientos: [
        { cuenta: bono, monto: monto.neg() },
        { cuenta: cuentaUsuario(op.usuarioId, 'REAL'), monto },
      ],
      sinSaldoNegativoEn: bono,
    });
  }

  obtenerSaldos(usuarioId: string, tx?: ClienteTransaccional): Promise<SaldosUsuario> {
    return this.libro.obtenerSaldos(usuarioId, tx ?? this.prisma);
  }

  private deCasaAUsuario(
    tx: ClienteTransaccional,
    op: OperacionApuesta,
    tipo: 'PREMIO' | 'REEMBOLSO',
  ): Promise<ResultadoAsiento> {
    const monto = validarMonto(op.monto);
    return this.libro.registrar(tx, {
      usuarioId: op.usuarioId,
      tipo,
      claveIdempotencia: op.claveIdempotencia,
      origenTipo: 'apuesta',
      origenId: op.apuestaId,
      movimientos: [
        { cuenta: CUENTA_CASA, monto: monto.neg() },
        { cuenta: cuentaUsuario(op.usuarioId, op.tipoSaldo), monto },
      ],
    });
  }
}
