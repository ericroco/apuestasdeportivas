import type { ClienteTransaccional } from '../contracts/billetera.port.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RegistroAlertasService } from './registro-alertas.service.js';

function crearPrismaFalso(insertadas = 1) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(insertadas),
    alertaFraude: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

const ALERTA = {
  regla: 'CUPON_CUENTA_MULTIPLE',
  severidad: 'ALTA',
  usuarioId: 'u-1',
  evidencia: { cuponId: 'c-1', cuentas: ['u-1', 'u-2'] },
  claveDeduplicacion: 'cupon:u-1:c-1',
} as const;

describe('RegistroAlertasService.registrar', () => {
  it('inserta con on conflict (clave_deduplicacion) do nothing y dice si la creó', async () => {
    const prisma = crearPrismaFalso(1);

    const creada = await new RegistroAlertasService(prisma as unknown as PrismaService).registrar(
      ALERTA,
    );

    expect(creada).toBe(true);
    const [consulta, ...valores] = prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    expect(consulta.join('?')).toMatch(/ON CONFLICT \(clave_deduplicacion\) DO NOTHING/);
    expect(valores).toEqual([
      'CUPON_CUENTA_MULTIPLE',
      'ALTA',
      'u-1',
      JSON.stringify(ALERTA.evidencia),
      'cupon:u-1:c-1',
    ]);
  });

  it('devuelve false si la misma evidencia ya tenía alerta (deduplicación)', async () => {
    const prisma = crearPrismaFalso(0);

    expect(
      await new RegistroAlertasService(prisma as unknown as PrismaService).registrar(ALERTA),
    ).toBe(false);
  });
});

describe('RegistroAlertasService.tieneAlertaAltaVigente', () => {
  it('busca alertas ALTA abiertas o confirmadas del usuario', async () => {
    const prisma = crearPrismaFalso();
    prisma.alertaFraude.findFirst.mockResolvedValue({ id: 'a-1' });

    const vigente = await new RegistroAlertasService(
      prisma as unknown as PrismaService,
    ).tieneAlertaAltaVigente('u-1');

    expect(vigente).toBe(true);
    expect(prisma.alertaFraude.findFirst).toHaveBeenCalledWith({
      where: { usuarioId: 'u-1', severidad: 'ALTA', estado: { in: ['ABIERTA', 'CONFIRMADA'] } },
      select: { id: true },
    });
  });

  it('usa el cliente transaccional si se lo pasan', async () => {
    const prisma = crearPrismaFalso();
    const tx = { alertaFraude: { findFirst: vi.fn().mockResolvedValue(null) } };

    const vigente = await new RegistroAlertasService(
      prisma as unknown as PrismaService,
    ).tieneAlertaAltaVigente('u-1', tx as unknown as ClienteTransaccional);

    expect(vigente).toBe(false);
    expect(tx.alertaFraude.findFirst).toHaveBeenCalled();
    expect(prisma.alertaFraude.findFirst).not.toHaveBeenCalled();
  });
});
