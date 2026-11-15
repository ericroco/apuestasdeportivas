import { bonoDePrueba } from '../../test/fabricas/promociones.js';
import type { Reloj } from '../comun/reloj.js';
import { validarEntorno } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MisBonosService } from './mis-bonos.service.js';

const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };
const ENTORNO = validarEntorno({
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:3000',
  CUPON_ROLLOVER_CUOTA_MINIMA: '1.75',
});

describe('MisBonosService.obtener', () => {
  it('separa el bono activo del historial y lista los canjes rechazados con su motivo', async () => {
    const cupon = { codigo: 'BIENVENIDA10' };
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      bono: {
        findMany: vi.fn().mockResolvedValue([
          { ...bonoDePrueba({ avance: new Prisma.Decimal('25') }), cupon },
          {
            ...bonoDePrueba({
              id: 'bono-viejo',
              estado: 'CUMPLIDO',
              montoConvertido: new Prisma.Decimal('8'),
            }),
            cupon,
          },
        ]),
      },
      canjeCupon: {
        findMany: vi.fn().mockResolvedValue([
          { codigo: 'OTRO', motivo: 'BONO_ACTIVO', creadoEn: AHORA },
          { codigo: 'RARO', motivo: 'DESCONOCIDO', creadoEn: AHORA },
        ]),
      },
    };

    const mios = await new MisBonosService(
      prisma as unknown as PrismaService,
      ENTORNO,
      reloj,
    ).obtener('apostador-1');

    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("SET estado = 'VENCIDO'")]),
      'apostador-1',
      AHORA,
    );
    expect(mios.activo).toMatchObject({ avance: '25.00', porcentajeAvance: 50 });
    expect(mios.historial).toEqual([
      expect.objectContaining({ id: 'bono-viejo', estado: 'CUMPLIDO', montoConvertido: '8.00' }),
    ]);
    expect(mios.canjesRechazados).toEqual([
      {
        codigo: 'OTRO',
        motivo: {
          codigo: 'BONO_ACTIVO',
          mensaje: 'Ya tienes un bono activo; termina su rollover antes de usar otro.',
        },
        creadoEn: AHORA.toISOString(),
      },
    ]);
    expect(mios.cuotaMinima).toBe('1.75');
  });
});
