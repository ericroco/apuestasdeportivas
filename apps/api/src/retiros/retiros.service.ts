import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CUENTA_PASARELA,
  CUENTA_RETIROS_TRANSITO,
  cuentaUsuario,
  LibroContableService,
} from '../billetera/libro-contable.service.js';
import { ENTORNO, type Entorno } from '../config/env.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import type { UsuarioAutenticado } from '../contracts/autenticacion.js';
import { type ClienteTransaccional, SaldoInsuficienteError } from '../contracts/billetera.port.js';
import { EVENTOS, type RetiroSolicitado } from '../contracts/eventos.js';
import { RIESGO_PORT, type RiesgoPort } from '../contracts/promociones.port.js';
import { Prisma, type Retiro } from '../generated/prisma/client.js';
import type { ClienteHttp } from '../identidad/http/cliente-http.js';
import { SegundoFactorService } from '../identidad/segundo-factor.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SolicitudRetiro {
  readonly monto: string;
  readonly metodoPagoId: string;
  readonly codigo2fa: string;
  readonly claveSolicitud: string;
}

export interface RetiroVista {
  readonly id: string;
  readonly monto: string;
  readonly estado: Retiro['estado'];
  readonly referenciaPago: string | null;
  readonly motivosRevision: readonly string[];
  readonly comentario: string | null;
  readonly creadoEn: Date;
}

const vista = (r: Retiro): RetiroVista => ({
  id: r.id,
  monto: r.monto.toFixed(2),
  estado: r.estado,
  referenciaPago: r.referenciaPago,
  motivosRevision: r.motivosRevision,
  comentario: r.comentario,
  creadoEn: r.creadoEn,
});

const referenciaSimulada = (): string => `SIM-${randomUUID()}`;

/** HU7 y HU8: retiros al mismo titular con 2FA, pago automático bajo el umbral y revisión sobre él. */
@Injectable()
export class RetirosService {
  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    private readonly prisma: PrismaService,
    private readonly libro: LibroContableService,
    private readonly segundoFactor: SegundoFactorService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
    private readonly eventos: EventEmitter2,
    // Lo provee el Spec 4; sin él, todo retiro sobre el umbral va a revisión (contrato 4).
    @Optional() @Inject(RIESGO_PORT) private readonly riesgo?: RiesgoPort,
  ) {}

  async solicitar(
    usuario: UsuarioAutenticado,
    datos: SolicitudRetiro,
    cliente: ClienteHttp,
  ): Promise<RetiroVista> {
    if (usuario.roles.some((rol) => rol !== 'APOSTADOR')) {
      throw new ForbiddenException('Las cuentas de operador o administrador no pueden retirar.');
    }
    const cuenta = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    if (!cuenta.correoVerificadoEn)
      throw new ForbiddenException('Confirma tu correo antes de retirar.');
    if (!(await this.segundoFactor.tieneActivo(usuario.id))) {
      throw new ForbiddenException('Activa el segundo factor en Seguridad para poder retirar.');
    }
    if (!(await this.segundoFactor.verificarCodigo(usuario.id, datos.codigo2fa))) {
      throw new ForbiddenException('El código del segundo factor no es correcto o ya se usó.');
    }
    const monto = new Prisma.Decimal(datos.monto);
    const { RETIRO_MIN: minimo, RETIRO_MAX: maximo, RETIRO_UMBRAL_REVISION: umbral } = this.entorno;
    if (monto.lt(minimo) || monto.gt(maximo)) {
      throw new BadRequestException(`El retiro debe estar entre ${minimo} y ${maximo} USD.`);
    }
    // FR-054: solo a un método y titular de un depósito confirmado del propio usuario.
    const metodo = await this.prisma.metodoPago.findUnique({ where: { id: datos.metodoPagoId } });
    if (metodo?.usuarioId !== usuario.id) {
      throw new BadRequestException(
        'Elige como destino uno de los métodos con los que depositaste.',
      );
    }

    const motivos: string[] = [];
    if (monto.gt(umbral)) motivos.push(`monto sobre el umbral de ${umbral} USD`);
    const evaluacion = await this.riesgo?.evaluarRetiro(usuario.id, monto);
    if (evaluacion?.requiereRevision) motivos.push(...evaluacion.motivos);

    let resultado: { retiro: Retiro; nuevo: boolean };
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        await this.libro.bloquearBilletera(tx, usuario.id);
        const previo = await tx.retiro.findUnique({
          where: {
            usuarioId_claveSolicitud: {
              usuarioId: usuario.id,
              claveSolicitud: datos.claveSolicitud,
            },
          },
        });
        if (previo) return { retiro: previo, nuevo: false };

        const retiro = await tx.retiro.create({
          data: {
            usuarioId: usuario.id,
            metodoPagoId: metodo.id,
            monto,
            claveSolicitud: datos.claveSolicitud,
            motivosRevision: motivos,
          },
        });
        // FR-056: la reserva sale del saldo real en la misma transacción. Sin saldo (o con saldo negativo), falla.
        await this.libro.registrar(tx, {
          usuarioId: usuario.id,
          tipo: 'RETIRO_RESERVA',
          claveIdempotencia: `retiro:${retiro.id}:reserva`,
          origenTipo: 'retiro',
          origenId: retiro.id,
          movimientos: [
            { cuenta: cuentaUsuario(usuario.id, 'REAL'), monto: monto.neg() },
            { cuenta: CUENTA_RETIROS_TRANSITO, monto },
          ],
          sinSaldoNegativoEn: cuentaUsuario(usuario.id, 'REAL'),
        });
        await this.auditar(tx, usuario.id, 'retiro.solicitado', retiro, cliente, { motivos });
        // FR-057 (aclaración del 2026-11-15): bajo el umbral y sin alertas, se paga al instante.
        const pagado = motivos.length === 0 ? await this.pagar(tx, retiro, null, cliente) : retiro;
        return { retiro: pagado, nuevo: true };
      });
    } catch (error) {
      if (error instanceof SaldoInsuficienteError) {
        throw new BadRequestException('No tienes saldo real suficiente para ese retiro.');
      }
      throw error;
    }

    if (resultado.nuevo) {
      const evento: RetiroSolicitado = {
        usuarioId: usuario.id,
        retiroId: resultado.retiro.id,
        monto: resultado.retiro.monto.toFixed(2),
      };
      this.eventos.emit(EVENTOS.retiroSolicitado, evento);
    }
    return vista(resultado.retiro);
  }

  async listarPropios(usuarioId: string): Promise<RetiroVista[]> {
    const retiros = await this.prisma.retiro.findMany({
      where: { usuarioId },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    });
    return retiros.map(vista);
  }

  /** Métodos con los que el usuario depositó: los únicos destinos posibles (FR-054). */
  async metodos(usuarioId: string) {
    const metodos = await this.prisma.metodoPago.findMany({
      where: { usuarioId },
      orderBy: { creadoEn: 'desc' },
    });
    return metodos.map((m) => ({
      id: m.id,
      descripcion:
        m.tipo === 'TARJETA'
          ? `${m.marca ?? 'Tarjeta'} •••• ${m.ultimosDigitos ?? ''}${m.titularNombre ? ` · ${m.titularNombre}` : ''}`
          : `Payphone ${m.telefono ?? ''}`.trim(),
    }));
  }

  async pendientes() {
    const retiros = await this.prisma.retiro.findMany({
      where: { estado: 'PENDIENTE_REVISION' },
      orderBy: { creadoEn: 'asc' },
      include: { usuario: true, metodoPago: true },
      take: 100,
    });
    return retiros.map((r) => ({
      ...vista(r),
      usuario: {
        id: r.usuario.id,
        email: r.usuario.email,
        nombreCompleto: r.usuario.nombreCompleto,
      },
      metodo:
        `${r.metodoPago.marca ?? r.metodoPago.tipo} ${r.metodoPago.ultimosDigitos ?? ''}`.trim(),
      titular: r.metodoPago.titularNombre,
    }));
  }

  /** HU8: aprobar paga con referencia simulada. Idempotente: un retiro ya resuelto no cambia. */
  aprobar(admin: UsuarioAutenticado, id: string, codigo2fa: string, cliente: ClienteHttp) {
    return this.resolver(admin, id, codigo2fa, cliente, (tx, retiro) =>
      this.pagar(tx, retiro, admin.id, cliente),
    );
  }

  /** HU8: rechazar devuelve el monto reservado al saldo real del usuario. */
  rechazar(
    admin: UsuarioAutenticado,
    id: string,
    motivo: string,
    codigo2fa: string,
    cliente: ClienteHttp,
  ) {
    return this.resolver(admin, id, codigo2fa, cliente, async (tx, retiro) => {
      await this.libro.registrar(tx, {
        usuarioId: retiro.usuarioId,
        tipo: 'RETIRO_DEVOLUCION',
        claveIdempotencia: `retiro:${retiro.id}:devolucion`,
        origenTipo: 'retiro',
        origenId: retiro.id,
        movimientos: [
          { cuenta: CUENTA_RETIROS_TRANSITO, monto: retiro.monto.neg() },
          { cuenta: cuentaUsuario(retiro.usuarioId, 'REAL'), monto: retiro.monto },
        ],
      });
      const rechazado = await tx.retiro.update({
        where: { id: retiro.id },
        data: {
          estado: 'RECHAZADO',
          comentario: motivo,
          resueltoPorId: admin.id,
          resueltoEn: new Date(),
        },
      });
      await this.auditar(tx, admin.id, 'retiro.rechazado', rechazado, cliente, { motivo });
      return rechazado;
    });
  }

  private async resolver(
    admin: UsuarioAutenticado,
    id: string,
    codigo2fa: string,
    cliente: ClienteHttp,
    accion: (tx: ClienteTransaccional, retiro: Retiro) => Promise<Retiro>,
  ): Promise<RetiroVista> {
    if (!(await this.segundoFactor.verificarCodigo(admin.id, codigo2fa))) {
      throw new ForbiddenException('El código de tu segundo factor no es correcto.');
    }
    const resultado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM retiro WHERE id = ${id}::uuid FOR UPDATE`;
      const retiro = await tx.retiro.findUnique({ where: { id } });
      if (!retiro) throw new NotFoundException('No existe ese retiro.');
      // FR-059: separación de funciones.
      if (retiro.usuarioId === admin.id)
        throw new ForbiddenException('No puedes resolver tu propio retiro.');
      if (retiro.estado !== 'PENDIENTE_REVISION') return retiro;
      return accion(tx, retiro);
    });
    return vista(resultado);
  }

  /** Mueve el dinero de tránsito a la pasarela y marca el retiro pagado con una referencia simulada. */
  private async pagar(
    tx: ClienteTransaccional,
    retiro: Retiro,
    adminId: string | null,
    cliente: ClienteHttp,
  ): Promise<Retiro> {
    await this.libro.registrar(tx, {
      usuarioId: retiro.usuarioId,
      tipo: 'RETIRO_PAGO',
      claveIdempotencia: `retiro:${retiro.id}:pago`,
      origenTipo: 'retiro',
      origenId: retiro.id,
      movimientos: [
        { cuenta: CUENTA_RETIROS_TRANSITO, monto: retiro.monto.neg() },
        { cuenta: CUENTA_PASARELA, monto: retiro.monto },
      ],
    });
    const pagado = await tx.retiro.update({
      where: { id: retiro.id },
      data: {
        estado: 'PAGADO',
        referenciaPago: referenciaSimulada(),
        resueltoPorId: adminId,
        resueltoEn: new Date(),
      },
    });
    await this.auditar(tx, adminId, 'retiro.aprobado', pagado, cliente, {
      automatico: adminId === null,
      referenciaPago: pagado.referenciaPago,
    });
    return pagado;
  }

  private auditar(
    tx: ClienteTransaccional,
    actorId: string | null,
    accion: string,
    retiro: Retiro,
    cliente: ClienteHttp,
    datos: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.registrar(
      {
        actorId,
        accion,
        entidad: 'retiro',
        entidadId: retiro.id,
        datos: { usuarioId: retiro.usuarioId, monto: retiro.monto.toFixed(2), ...datos },
        ip: cliente.ip,
        dispositivo: cliente.dispositivo,
      },
      tx,
    );
  }
}
