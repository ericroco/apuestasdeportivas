import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../contracts/autenticacion.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LibroContableService } from './libro-contable.service.js';

const esquemaPagina = z
  .object({
    pagina: z.coerce.number().int().min(1).max(1000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

interface FilaMovimiento {
  id: string;
  fecha: Date;
  tipo: string;
  tipo_cuenta: 'USUARIO_REAL' | 'USUARIO_BONO';
  monto: Prisma.Decimal;
  saldo_resultante: Prisma.Decimal;
  origen_tipo: string;
  origen_id: string;
}

/** HU4: saldos y movimientos del propio usuario (FR-043). Solo lectura: no existe ruta que edite un saldo. */
@Controller('billetera')
@Roles('APOSTADOR')
export class BilleteraController {
  constructor(
    private readonly libro: LibroContableService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async saldos(@UsuarioActual() usuario: UsuarioAutenticado) {
    const { real, bono } = await this.libro.obtenerSaldos(usuario.id);
    return {
      real: real.toFixed(2),
      bono: bono.toFixed(2),
      // El bono no es retirable y un saldo negativo (reversión de premio) no permite retirar.
      retirable: (real.gt(0) ? real : real.mul(0)).toFixed(2),
    };
  }

  @Get('movimientos')
  async movimientos(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Query({ schema: esquemaPagina }) { pagina, limite }: z.infer<typeof esquemaPagina>,
  ) {
    // El saldo resultante se calcula al consultar (ventana por cuenta); no se guarda (research §8).
    const filas = await this.prisma.$queryRaw<FilaMovimiento[]>`
      SELECT * FROM (
        SELECT l.id, a.creado_en AS fecha, a.tipo::text AS tipo, c.tipo::text AS tipo_cuenta, l.monto,
               SUM(l.monto) OVER (PARTITION BY l.cuenta_id ORDER BY a.creado_en, l.id) AS saldo_resultante,
               a.origen_tipo, a.origen_id
        FROM linea_asiento l
        JOIN asiento a ON a.id = l.asiento_id
        JOIN cuenta_contable c ON c.id = l.cuenta_id
        WHERE c.usuario_id = ${usuario.id}::uuid
      ) m
      ORDER BY fecha DESC, id DESC
      LIMIT ${limite + 1} OFFSET ${(pagina - 1) * limite}`;
    return {
      items: filas.slice(0, limite).map((f) => ({
        id: f.id,
        fecha: f.fecha,
        tipo: f.tipo,
        tipoSaldo: f.tipo_cuenta === 'USUARIO_REAL' ? 'REAL' : 'BONO',
        monto: f.monto.toFixed(2),
        saldoResultante: f.saldo_resultante.toFixed(2),
        origenTipo: f.origen_tipo,
        origenId: f.origen_id,
      })),
      siguiente: filas.length > limite ? pagina + 1 : null,
    };
  }
}
