import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LibroContableService } from '../billetera/libro-contable.service.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../contracts/auditoria.port.js';
import type { Rol } from '../contracts/autenticacion.js';
import type { EstadoUsuario, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ClienteHttp } from './http/cliente-http.js';
import { SegundoFactorService } from './segundo-factor.service.js';
import { SesionesService } from './sesiones.service.js';
import { TokensService } from './tokens.service.js';

export interface FiltroUsuarios {
  readonly q?: string;
  readonly estado?: EstadoUsuario;
  readonly rol?: Rol;
  readonly cursor?: string;
  readonly limite: number;
}

export interface UsuarioResumen {
  readonly id: string;
  readonly email: string;
  readonly nombreCompleto: string;
  readonly roles: readonly Rol[];
  readonly estado: EstadoUsuario;
  readonly verificado: boolean;
  readonly creadoEn: Date;
}

const resumir = (u: {
  id: string;
  email: string;
  nombreCompleto: string;
  roles: Rol[];
  estado: EstadoUsuario;
  correoVerificadoEn: Date | null;
  creadoEn: Date;
}): UsuarioResumen => ({
  id: u.id,
  email: u.email,
  nombreCompleto: u.nombreCompleto,
  roles: u.roles,
  estado: u.estado,
  verificado: u.correoVerificadoEn !== null,
  creadoEn: u.creadoEn,
});

/** HU9: gestión de usuarios y roles por el administrador (FR-026 a FR-028). */
@Injectable()
export class UsuariosAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segundoFactor: SegundoFactorService,
    private readonly sesiones: SesionesService,
    private readonly tokens: TokensService,
    private readonly libro: LibroContableService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
  ) {}

  async listar(
    filtro: FiltroUsuarios,
  ): Promise<{ items: UsuarioResumen[]; siguiente: string | null }> {
    const where: Prisma.UsuarioWhereInput = {
      ...(filtro.q
        ? {
            OR: [
              { email: { contains: filtro.q.toLowerCase() } },
              { nombreCompleto: { contains: filtro.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.rol ? { roles: { has: filtro.rol } } : {}),
    };
    const filas = await this.prisma.usuario.findMany({
      where,
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: filtro.limite + 1,
      ...(filtro.cursor ? { cursor: { id: filtro.cursor }, skip: 1 } : {}),
    });
    const items = filas.slice(0, filtro.limite).map(resumir);
    return { items, siguiente: filas.length > filtro.limite ? (items.at(-1)?.id ?? null) : null };
  }

  async detalle(id: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: { segundoFactor: true },
    });
    if (!usuario) throw new NotFoundException('No existe ese usuario.');
    const [sesionesActivas, actividad] = await Promise.all([
      this.prisma.sesion.count({
        where: { usuarioId: id, revocadaEn: null, usadaEn: null, expiraEn: { gt: new Date() } },
      }),
      this.prisma.eventoAuditoria.findMany({
        where: { OR: [{ actorId: id }, { entidad: 'usuario', entidadId: id }] },
        orderBy: { creadoEn: 'desc' },
        take: 20,
      }),
    ]);
    return {
      ...resumir(usuario),
      tiene2fa: Boolean(usuario.segundoFactor?.activadoEn),
      bloqueadoHasta: usuario.bloqueadoHasta,
      sesionesActivas,
      actividad,
    };
  }

  async cambiarRoles(
    adminId: string,
    usuarioId: string,
    roles: Rol[],
    codigo2fa: string,
    cliente: ClienteHttp,
  ): Promise<UsuarioResumen> {
    await this.exigirSegundoFactor(adminId, codigo2fa);
    const usuario = await this.buscar(usuarioId);
    const nuevos = [...new Set(roles)];
    if (usuario.roles.includes('ADMINISTRADOR') && !nuevos.includes('ADMINISTRADOR')) {
      await this.exigirOtroAdministrador(usuarioId);
    }
    // FR-026 y FR-068: operador y administrador no tienen dinero en la plataforma.
    const promueve = nuevos.some((rol) => rol !== 'APOSTADOR' && !usuario.roles.includes(rol));
    if (promueve) {
      const { real, bono } = await this.libro.obtenerSaldos(usuarioId);
      if (!real.isZero() || !bono.isZero()) {
        throw new ConflictException(
          'Ese usuario tiene saldo en su billetera. Debe quedar en cero antes de darle un rol de operador o administrador.',
        );
      }
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const fila = await tx.usuario.update({ where: { id: usuarioId }, data: { roles: nuevos } });
      await this.auditoria.registrar(
        {
          actorId: adminId,
          accion: 'usuario.rol_cambiado',
          entidad: 'usuario',
          entidadId: usuarioId,
          datos: { anteriores: usuario.roles, nuevos },
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
      return fila;
    });
    // El acceso anterior deja de servir; la renovación entrega los roles nuevos.
    await this.tokens.revocarAccesosDe(usuarioId);
    return resumir(actualizado);
  }

  async suspender(
    adminId: string,
    usuarioId: string,
    motivo: string,
    cliente: ClienteHttp,
  ): Promise<void> {
    if (adminId === usuarioId) throw new ConflictException('No puedes suspender tu propia cuenta.');
    const usuario = await this.buscar(usuarioId);
    if (usuario.roles.includes('ADMINISTRADOR')) await this.exigirOtroAdministrador(usuarioId);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: usuarioId }, data: { estado: 'SUSPENDIDO' } });
      await this.sesiones.cerrarTodas(usuarioId, tx);
      await this.auditoria.registrar(
        {
          actorId: adminId,
          accion: 'usuario.suspendido',
          entidad: 'usuario',
          entidadId: usuarioId,
          datos: { motivo },
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
    });
  }

  async reactivar(adminId: string, usuarioId: string, cliente: ClienteHttp): Promise<void> {
    const usuario = await this.buscar(usuarioId);
    if (usuario.estado !== 'SUSPENDIDO') return;
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { estado: usuario.correoVerificadoEn ? 'ACTIVO' : 'PENDIENTE_VERIFICACION' },
      });
      await this.auditoria.registrar(
        {
          actorId: adminId,
          accion: 'usuario.reactivado',
          entidad: 'usuario',
          entidadId: usuarioId,
          ip: cliente.ip,
          dispositivo: cliente.dispositivo,
        },
        tx,
      );
    });
  }

  private async buscar(id: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('No existe ese usuario.');
    return usuario;
  }

  /** FR-021: cambiar roles exige el código 2FA del administrador que lo hace. */
  private async exigirSegundoFactor(adminId: string, codigo: string): Promise<void> {
    if (!(await this.segundoFactor.verificarCodigo(adminId, codigo))) {
      throw new ForbiddenException('El código de tu segundo factor no es correcto.');
    }
  }

  /** FR-026: siempre debe quedar al menos un administrador activo. */
  private async exigirOtroAdministrador(usuarioId: string): Promise<void> {
    const otros = await this.prisma.usuario.count({
      where: {
        id: { not: usuarioId },
        roles: { has: 'ADMINISTRADOR' },
        estado: { not: 'SUSPENDIDO' },
      },
    });
    if (otros === 0) {
      throw new ConflictException('Debe quedar al menos un administrador activo.');
    }
  }
}
