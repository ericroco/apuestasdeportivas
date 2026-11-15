import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CUENTA_PASARELA,
  cuentaUsuario,
  LibroContableService,
} from '../billetera/libro-contable.service.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import type { UsuarioAutenticado } from '../contracts/autenticacion.js';
import { type DepositoConfirmado, EVENTOS } from '../contracts/eventos.js';
import { type EstadoIntencionPago, Prisma } from '../generated/prisma/client.js';
import type { ClienteHttp } from '../identidad/http/cliente-http.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type ConfirmacionPasarela,
  PASARELA_PORT,
  PasarelaNoDisponibleError,
  type PasarelaPort,
} from './pasarela.port.js';
import {
  aCentavos,
  metodoDeLaConfirmacion,
  verificarConfirmacion,
} from './verificar-confirmacion.js';

/** Formulario de Payphone (10 min) + plazo de confirmación (5 min) (FR-050). */
const VIDA_INTENCION_MS = 15 * 60 * 1000;

export interface EstadoDeposito {
  readonly id: string;
  readonly estado: EstadoIntencionPago;
  readonly monto: string;
  readonly motivoFallo: string | null;
}

/** HU5: depósitos con Payphone confirmados servidor a servidor (FR-045 a FR-052). */
@Injectable()
export class DepositosService {
  private readonly logger = new Logger(DepositosService.name);

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly prisma: PrismaService,
    private readonly libro: LibroContableService,
    @Inject(PASARELA_PORT) private readonly pasarela: PasarelaPort,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
    private readonly eventos: EventEmitter2,
  ) {}

  async iniciar(
    usuario: UsuarioAutenticado,
    datos: { monto: string; codigoCupon?: string },
    cliente: ClienteHttp,
  ): Promise<{ intencionId: string; urlPago: string }> {
    // FR-068: operador y administrador no mueven dinero en la plataforma.
    if (usuario.roles.some((rol) => rol !== 'APOSTADOR')) {
      throw new ForbiddenException('Las cuentas de operador o administrador no pueden depositar.');
    }
    const cuenta = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    if (!cuenta.correoVerificadoEn) {
      throw new ForbiddenException('Confirma tu correo antes de depositar.');
    }
    const monto = new Prisma.Decimal(datos.monto);
    const [minimo, maximo] = [this.entorno.DEPOSITO_MIN, this.entorno.DEPOSITO_MAX];
    if (monto.lt(minimo) || monto.gt(maximo)) {
      throw new BadRequestException(`El depósito debe estar entre ${minimo} y ${maximo} USD.`);
    }

    const intencion = await this.prisma.intencionPago.create({
      data: {
        usuarioId: usuario.id,
        monto,
        codigoCupon: datos.codigoCupon?.trim().toUpperCase() || null,
        expiraEn: new Date(Date.now() + VIDA_INTENCION_MS),
        ip: cliente.ip,
        dispositivo: cliente.dispositivo,
      },
    });
    const retorno = `${this.entorno.WEB_ORIGIN}/billetera/deposito/retorno`;
    let preparado;
    try {
      preparado = await this.pasarela.preparar({
        montoCentavos: aCentavos(monto),
        referencia: intencion.id,
        urlRespuesta: retorno,
        urlCancelacion: `${retorno}?cancelado=1&clientTransactionId=${intencion.id}`,
      });
    } catch (error) {
      await this.prisma.intencionPago.update({
        where: { id: intencion.id },
        data: {
          estado: 'FALLIDA',
          motivoFallo: 'La pasarela no respondió',
          resueltaEn: new Date(),
        },
      });
      if (error instanceof PasarelaNoDisponibleError) {
        this.logger.error(error.message);
        throw new ServiceUnavailableException(
          'Los depósitos no están disponibles en este momento.',
        );
      }
      throw error;
    }
    await this.prisma.intencionPago.update({
      where: { id: intencion.id },
      data: { payphonePaymentId: preparado.paymentId },
    });
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'deposito.iniciado',
      entidad: 'intencion_pago',
      entidadId: intencion.id,
      datos: { monto: monto.toFixed(2), codigoCupon: intencion.codigoCupon },
      ip: cliente.ip,
      dispositivo: cliente.dispositivo,
    });
    return { intencionId: intencion.id, urlPago: preparado.urlPago };
  }

  /**
   * Confirmación servidor a servidor (FR-047, FR-048). La autoridad es la respuesta de Payphone, no el navegador:
   * por eso la ruta es pública. Idempotente: repetirla, o recibirla a la vez, acredita una sola vez.
   */
  async confirmar(id: number, referencia: string, cliente: ClienteHttp): Promise<EstadoDeposito> {
    const intencion = await this.prisma.intencionPago.findUnique({ where: { id: referencia } });
    if (!intencion) throw new NotFoundException('No encontramos ese depósito.');
    if (intencion.estado !== 'PENDIENTE' && intencion.estado !== 'CADUCADA')
      return this.estado(intencion);

    // La llamada a la red va antes de la transacción, para no retener el bloqueo durante la espera.
    let confirmacion: ConfirmacionPasarela;
    try {
      confirmacion = await this.pasarela.confirmar(id, referencia);
    } catch (error) {
      this.logger.warn(`No se pudo confirmar ${referencia}: ${(error as Error).message}`);
      throw new BadGatewayException(
        'No pudimos confirmar el pago con Payphone. Vuelve a intentarlo.',
      );
    }
    const veredicto = verificarConfirmacion(intencion, confirmacion);

    const resultado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM intencion_pago WHERE id = ${referencia}::uuid FOR UPDATE`;
      const actual = await tx.intencionPago.findUniqueOrThrow({ where: { id: referencia } });
      if (actual.estado !== 'PENDIENTE' && actual.estado !== 'CADUCADA')
        return { actual, nuevo: false };

      let estado: EstadoIntencionPago;
      let motivo: string | null = null;
      let metodoPagoId: string | null = null;
      let acreditar = veredicto.resultado === 'aprobada';
      if (acreditar) {
        // Una transacción de Payphone ya usada en otra intención no se acredita dos veces.
        const otra = await tx.intencionPago.findUnique({
          where: { payphoneTransaccionId: BigInt(confirmacion.transactionId) },
        });
        if (otra) {
          acreditar = false;
          motivo = 'la transacción de la pasarela ya se usó en otro depósito';
        }
      }

      if (acreditar) {
        const metodo = metodoDeLaConfirmacion(confirmacion);
        const fila = await tx.metodoPago.upsert({
          where: { usuarioId_huella: { usuarioId: actual.usuarioId, huella: metodo.huella } },
          create: { usuarioId: actual.usuarioId, ...metodo },
          update: {},
        });
        metodoPagoId = fila.id;
        await this.libro.registrar(tx, {
          usuarioId: actual.usuarioId,
          tipo: 'DEPOSITO',
          claveIdempotencia: `deposito:${actual.id}:acreditacion`,
          origenTipo: 'deposito',
          origenId: actual.id,
          movimientos: [
            { cuenta: CUENTA_PASARELA, monto: actual.monto.neg() },
            { cuenta: cuentaUsuario(actual.usuarioId, 'REAL'), monto: actual.monto },
          ],
        });
        estado = 'CONFIRMADA';
      } else if (veredicto.resultado === 'cancelada' && !motivo) {
        estado = 'FALLIDA';
        motivo = 'El pago fue cancelado o rechazado en Payphone.';
      } else {
        estado = 'RECHAZADA_DISCREPANCIA';
        motivo ??= veredicto.resultado === 'discrepancia' ? veredicto.motivo : 'discrepancia';
      }

      const final = await tx.intencionPago.update({
        where: { id: actual.id },
        data: {
          estado,
          motivoFallo: motivo,
          metodoPagoId,
          resueltaEn: new Date(),
          ...(estado === 'CONFIRMADA'
            ? { payphoneTransaccionId: BigInt(confirmacion.transactionId) }
            : {}),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: null,
          accion:
            estado === 'CONFIRMADA'
              ? 'deposito.confirmado'
              : estado === 'FALLIDA'
                ? 'deposito.fallido'
                : 'deposito.discrepancia',
          entidad: 'intencion_pago',
          entidadId: actual.id,
          datos: {
            usuarioId: actual.usuarioId,
            monto: actual.monto.toFixed(2),
            transaccionPasarela: String(confirmacion.transactionId),
            montoPasarela: confirmacion.amount,
            monedaPasarela: confirmacion.currency ?? null,
            motivo,
          },
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
      return { actual: final, nuevo: true };
    });

    if (
      resultado.nuevo &&
      resultado.actual.estado === 'RECHAZADA_DISCREPANCIA' &&
      veredicto.resultado !== 'cancelada'
    ) {
      // FR-050: el dinero cobrado con datos que no coinciden se devuelve.
      await this.pasarela.reversar(confirmacion.transactionId).catch((error: unknown) => {
        this.logger.error(
          `No se pudo pedir el reverso de ${confirmacion.transactionId}: ${(error as Error).message}`,
        );
      });
    }
    if (resultado.nuevo && resultado.actual.estado === 'CONFIRMADA') {
      const evento: DepositoConfirmado = {
        usuarioId: resultado.actual.usuarioId,
        depositoId: resultado.actual.id,
        monto: resultado.actual.monto.toFixed(2),
        codigoCupon: resultado.actual.codigoCupon,
      };
      this.eventos.emit(EVENTOS.depositoConfirmado, evento);
    }
    return this.estado(resultado.actual);
  }

  async consultar(usuarioId: string, id: string): Promise<EstadoDeposito> {
    const intencion = await this.prisma.intencionPago.findUnique({ where: { id } });
    if (intencion?.usuarioId !== usuarioId)
      throw new NotFoundException('No encontramos ese depósito.');
    return this.estado(intencion);
  }

  /** FR-050: sin confirmación en 15 minutos, la intención caduca (Payphone ya revirtió el cobro a los 5). */
  @Cron(CronExpression.EVERY_MINUTE)
  async caducarVencidas(): Promise<number> {
    const { count } = await this.prisma.intencionPago.updateMany({
      where: { estado: 'PENDIENTE', expiraEn: { lt: new Date() } },
      data: {
        estado: 'CADUCADA',
        motivoFallo: 'El pago no se confirmó a tiempo.',
        resueltaEn: new Date(),
      },
    });
    return count;
  }

  private estado(intencion: {
    id: string;
    estado: EstadoIntencionPago;
    monto: Prisma.Decimal;
    motivoFallo: string | null;
  }): EstadoDeposito {
    return {
      id: intencion.id,
      estado: intencion.estado,
      monto: intencion.monto.toFixed(2),
      motivoFallo: intencion.motivoFallo,
    };
  }
}
