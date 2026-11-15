import { AuditoriaEnMemoria } from '../../test/dobles/auditoria-en-memoria.js';
import { cuponDePrueba } from '../../test/fabricas/promociones.js';
import { DependenciaNoDisponibleError } from '../comun/dependencias.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import type { Reloj } from '../comun/reloj.js';
import { Prisma, type Cupon } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { esquemaCrearCupon } from './cupones.esquemas.js';
import { CuponesService } from './cupones.service.js';

const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };
const CONTEXTO = { actorId: 'operador-1', ip: '203.0.113.7', dispositivo: 'navegador-de-prueba' };

function crearPrismaFalso(cupon: Cupon | null = null) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(cupon ? [{ id: cupon.id }] : []),
    cupon: {
      create: vi.fn(async ({ data }: { data: Partial<Cupon> }) => cuponDePrueba({ ...data })),
      update: vi.fn(async ({ data }: { data: Partial<Cupon> }) => ({ ...cupon, ...data })),
      findUnique: vi.fn().mockResolvedValue(cupon),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (trabajo: unknown) =>
      typeof trabajo === 'function' ? trabajo(tx) : Promise.all(trabajo as Promise<unknown>[]),
    ),
    cupon: {
      findUnique: vi.fn().mockResolvedValue(cupon),
      findMany: vi.fn().mockResolvedValue(cupon ? [cupon] : []),
      count: vi.fn().mockResolvedValue(cupon ? 1 : 0),
    },
    canjeCupon: {
      groupBy: vi.fn().mockResolvedValue([
        { estado: 'ACEPTADO', _count: { _all: 4 } },
        { estado: 'RECHAZADO', _count: { _all: 1 } },
      ]),
    },
    bono: { aggregate: vi.fn().mockResolvedValue({ _sum: { monto: new Prisma.Decimal('40') } }) },
  };
  return { prisma, tx };
}

function crearServicio(prisma: unknown, auditoria: AuditoriaEnMemoria | undefined) {
  return new CuponesService(prisma as PrismaService, auditoria, reloj);
}

const nuevoCupon = esquemaCrearCupon.parse({
  codigo: 'cuota10',
  tipo: 'AUMENTO_CUOTA',
  porcentaje: '10',
  apuestaMaxima: '50',
  iniciaEn: '2026-11-01T00:00:00Z',
  terminaEn: '2026-12-31T00:00:00Z',
  cupoTotal: 10,
});

async function codigoDeError(promesa: Promise<unknown>): Promise<string | undefined> {
  const error: unknown = await promesa.then(
    () => undefined,
    (motivo: unknown) => motivo,
  );
  return error instanceof ErrorNegocio ? error.codigo : undefined;
}

describe('CuponesService.crear', () => {
  it('crea el cupón y registra cupon.creado en la misma transacción', async () => {
    const { prisma, tx } = crearPrismaFalso();
    const auditoria = new AuditoriaEnMemoria();

    const vista = await crearServicio(prisma, auditoria).crear(nuevoCupon, CONTEXTO);

    expect(tx.cupon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigo: 'CUOTA10', creadoPor: 'operador-1' }),
    });
    expect(vista).toMatchObject({
      codigo: 'CUOTA10',
      canjes: 0,
      porcentaje: '10.00',
      vigente: true,
    });
    expect(auditoria.eventos).toEqual([
      {
        enTransaccion: true,
        evento: expect.objectContaining({
          accion: 'cupon.creado',
          actorId: 'operador-1',
          entidad: 'cupon',
          ip: '203.0.113.7',
          dispositivo: 'navegador-de-prueba',
        }),
      },
    ]);
  });

  it('traduce el código duplicado (sin distinguir mayúsculas) a 409 CODIGO_DUPLICADO', async () => {
    const { prisma, tx } = crearPrismaFalso();
    tx.cupon.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );

    const servicio = crearServicio(prisma, new AuditoriaEnMemoria());

    expect(await codigoDeError(servicio.crear(nuevoCupon, CONTEXTO))).toBe('CODIGO_DUPLICADO');
  });

  it('sin auditoría falla con 503 antes de escribir', async () => {
    const { prisma } = crearPrismaFalso();

    await expect(crearServicio(prisma, undefined).crear(nuevoCupon, CONTEXTO)).rejects.toThrow(
      DependenciaNoDisponibleError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CuponesService.actualizar', () => {
  it('bloquea la fila, actualiza y audita con el antes y el después', async () => {
    const cupon = cuponDePrueba({ canjes: 2 });
    const { prisma, tx } = crearPrismaFalso(cupon);
    const auditoria = new AuditoriaEnMemoria();

    const vista = await crearServicio(prisma, auditoria).actualizar(
      cupon.id,
      { cupoTotal: 20 },
      CONTEXTO,
    );

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.cupon.update).toHaveBeenCalledWith({
      where: { id: cupon.id },
      data: { cupoTotal: 20 },
    });
    expect(vista.cupoTotal).toBe(20);
    expect(auditoria.eventos[0]?.evento).toMatchObject({
      accion: 'cupon.actualizado',
      entidadId: cupon.id,
      datos: { antes: { cupoTotal: 10 }, despues: { cupoTotal: 20 } },
    });
  });

  it('pausar registra cupon.pausado', async () => {
    const cupon = cuponDePrueba();
    const { prisma } = crearPrismaFalso(cupon);
    const auditoria = new AuditoriaEnMemoria();

    await crearServicio(prisma, auditoria).actualizar(cupon.id, { estado: 'PAUSADO' }, CONTEXTO);

    expect(auditoria.acciones()).toEqual(['cupon.pausado']);
  });

  it('con canjes rechaza cambiar el tipo y no actualiza nada', async () => {
    const cupon = cuponDePrueba({ canjes: 1 });
    const { prisma, tx } = crearPrismaFalso(cupon);
    const auditoria = new AuditoriaEnMemoria();

    const codigo = await codigoDeError(
      crearServicio(prisma, auditoria).actualizar(
        cupon.id,
        { tipo: 'APUESTA_GRATIS', montoFijo: new Prisma.Decimal(5) },
        CONTEXTO,
      ),
    );

    expect(codigo).toBe('CUPON_CON_CANJES');
    expect(tx.cupon.update).not.toHaveBeenCalled();
    expect(auditoria.eventos).toHaveLength(0);
  });

  it('un cambio sin diferencias no escribe ni audita', async () => {
    const cupon = cuponDePrueba();
    const { prisma, tx } = crearPrismaFalso(cupon);
    const auditoria = new AuditoriaEnMemoria();

    await crearServicio(prisma, auditoria).actualizar(cupon.id, { estado: 'ACTIVO' }, CONTEXTO);

    expect(tx.cupon.update).not.toHaveBeenCalled();
    expect(auditoria.eventos).toHaveLength(0);
  });

  it('responde 404 NO_ENCONTRADO si el cupón no existe', async () => {
    const { prisma } = crearPrismaFalso(null);

    const servicio = crearServicio(prisma, new AuditoriaEnMemoria());

    expect(await codigoDeError(servicio.actualizar('x', { estado: 'PAUSADO' }, CONTEXTO))).toBe(
      'NO_ENCONTRADO',
    );
  });

  it('sin auditoría falla con 503 antes de abrir la transacción', async () => {
    const { prisma } = crearPrismaFalso(cuponDePrueba());

    await expect(
      crearServicio(prisma, undefined).actualizar('x', { estado: 'PAUSADO' }, CONTEXTO),
    ).rejects.toThrow(DependenciaNoDisponibleError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CuponesService.obtener y listar', () => {
  it('devuelve el detalle con el resumen de canjes', async () => {
    const cupon = cuponDePrueba({ canjes: 4 });
    const { prisma } = crearPrismaFalso(cupon);

    const detalle = await crearServicio(prisma, undefined).obtener(cupon.id);

    expect(detalle.resumenCanjes).toEqual({ aceptados: 4, rechazados: 1, bonoOtorgado: '40.00' });
  });

  it('responde NO_ENCONTRADO para un cupón inexistente', async () => {
    const { prisma } = crearPrismaFalso(null);

    expect(await codigoDeError(crearServicio(prisma, undefined).obtener('x'))).toBe(
      'NO_ENCONTRADO',
    );
  });

  it('lista con filtros, búsqueda por prefijo normalizado y paginación', async () => {
    const { prisma } = crearPrismaFalso(cuponDePrueba());

    const pagina = await crearServicio(prisma, undefined).listar({
      estado: 'ACTIVO',
      busqueda: ' cuo ',
      pagina: 2,
      tamano: 5,
    });

    expect(prisma.cupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: 'ACTIVO', codigo: { startsWith: 'CUO' } },
        skip: 5,
        take: 5,
      }),
    );
    expect(pagina).toMatchObject({ total: 1, pagina: 2, tamano: 5 });
    expect(pagina.datos).toHaveLength(1);
  });
});
