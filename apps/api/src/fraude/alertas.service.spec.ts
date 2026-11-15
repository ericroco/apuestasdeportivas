import { AuditoriaEnMemoria } from '../../test/dobles/auditoria-en-memoria.js';
import { DependenciaNoDisponibleError } from '../comun/dependencias.js';
import { ErrorNegocio } from '../comun/error-negocio.js';
import type { Reloj } from '../comun/reloj.js';
import type { AlertaFraude } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AlertasService } from './alertas.service.js';
import { esquemaFiltrosAlertas, esquemaResolverAlerta } from './alertas.esquemas.js';

const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };
const CONTEXTO = { actorId: 'admin-1', ip: '203.0.113.7', dispositivo: 'navegador' };
const ID = '11111111-1111-4111-8111-111111111111';

const alerta = (cambios: Partial<AlertaFraude> = {}): AlertaFraude => ({
  id: ID,
  regla: 'CUENTAS_DISPOSITIVO',
  severidad: 'ALTA',
  usuarioId: 'u-1',
  evidencia: { dispositivo: 'd-1', cuentas: ['u-1', 'u-2'] },
  claveDeduplicacion: 'dispositivo:u-1:d-1',
  estado: 'ABIERTA',
  nota: null,
  resueltaPor: null,
  resueltaEn: null,
  creadaEn: new Date('2026-11-14T10:00:00Z'),
  ...cambios,
});

function crearPrismaFalso(
  opciones: { actualizadas?: number; existente?: AlertaFraude | null } = {},
) {
  const existente = opciones.existente === undefined ? alerta() : opciones.existente;
  const resuelta = alerta({
    estado: 'CONFIRMADA',
    nota: 'Mismo titular',
    resueltaPor: 'admin-1',
    resueltaEn: AHORA,
  });
  const alertaFraude = {
    findMany: vi.fn().mockResolvedValue([alerta()]),
    count: vi.fn().mockResolvedValue(1),
    findUnique: vi.fn().mockResolvedValue(existente),
    findUniqueOrThrow: vi.fn().mockResolvedValue(resuelta),
    updateMany: vi.fn().mockResolvedValue({ count: opciones.actualizadas ?? 1 }),
  };
  const tx = { alertaFraude };
  const prisma = {
    alertaFraude,
    $transaction: vi.fn(async (trabajo: unknown) =>
      typeof trabajo === 'function' ? trabajo(tx) : Promise.all(trabajo as Promise<unknown>[]),
    ),
  };
  return { prisma, alertaFraude };
}

function crear(prisma: unknown, auditoria: AuditoriaEnMemoria | undefined) {
  return new AlertasService(prisma as PrismaService, auditoria, reloj);
}

async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => undefined,
    (motivo: unknown) => motivo,
  );
}

describe('AlertasService.listar', () => {
  it('filtra por estado, severidad, regla, usuario y rango, de la más reciente a la más antigua', async () => {
    const { prisma, alertaFraude } = crearPrismaFalso();
    const filtros = esquemaFiltrosAlertas.parse({
      estado: 'ABIERTA',
      severidad: 'ALTA',
      regla: 'CUENTAS_IP',
      usuarioId: 'u-1',
      desde: '2026-11-01T00:00:00Z',
      hasta: '2026-11-30T00:00:00Z',
      pagina: '2',
      tamano: '10',
    });

    const pagina = await crear(prisma, undefined).listar(filtros);

    expect(alertaFraude.findMany).toHaveBeenCalledWith({
      where: {
        estado: 'ABIERTA',
        severidad: 'ALTA',
        regla: 'CUENTAS_IP',
        usuarioId: 'u-1',
        creadaEn: { gte: new Date('2026-11-01T00:00:00Z'), lte: new Date('2026-11-30T00:00:00Z') },
      },
      orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(pagina).toMatchObject({ total: 1, pagina: 2, tamano: 10 });
    expect(pagina.datos[0]).toMatchObject({ id: ID, creadaEn: '2026-11-14T10:00:00.000Z' });
  });

  it('sin filtros usa la página 1 de 20 y no agrega condiciones', async () => {
    const { prisma, alertaFraude } = crearPrismaFalso();

    await crear(prisma, undefined).listar(esquemaFiltrosAlertas.parse({}));

    expect(alertaFraude.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 20 }),
    );
  });
});

describe('esquemaFiltrosAlertas', () => {
  it('rechaza tamaños fuera de 1–100, estados desconocidos y rangos invertidos', () => {
    expect(esquemaFiltrosAlertas.safeParse({ tamano: '101' }).success).toBe(false);
    expect(esquemaFiltrosAlertas.safeParse({ tamano: '0' }).success).toBe(false);
    expect(esquemaFiltrosAlertas.safeParse({ estado: 'OTRA' }).success).toBe(false);
    expect(
      esquemaFiltrosAlertas.safeParse({
        desde: '2026-12-01T00:00:00Z',
        hasta: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('trata un filtro vacío como ausente', () => {
    expect(esquemaFiltrosAlertas.parse({ estado: '' }).estado).toBeUndefined();
  });
});

describe('esquemaResolverAlerta', () => {
  it('exige estado final y una nota de 5 a 500 caracteres (sin contar espacios de los bordes)', () => {
    const base = { estado: 'CONFIRMADA' };
    expect(esquemaResolverAlerta.safeParse({ ...base, nota: 'ok' }).success).toBe(false);
    expect(esquemaResolverAlerta.safeParse({ ...base, nota: '  ab  ' }).success).toBe(false);
    expect(esquemaResolverAlerta.safeParse({ ...base, nota: 'x'.repeat(501) }).success).toBe(false);
    expect(esquemaResolverAlerta.safeParse({ ...base, nota: 'x'.repeat(500) }).success).toBe(true);
    expect(esquemaResolverAlerta.safeParse({ estado: 'ABIERTA', nota: 'válida' }).success).toBe(
      false,
    );
  });
});

describe('AlertasService.obtener', () => {
  it('devuelve la vista de la alerta', async () => {
    const { prisma } = crearPrismaFalso();

    expect(await crear(prisma, undefined).obtener(ID)).toMatchObject({ id: ID, estado: 'ABIERTA' });
  });

  it('responde 404 NO_ENCONTRADO si no existe', async () => {
    const { prisma } = crearPrismaFalso({ existente: null });

    const error = await errorDe(crear(prisma, undefined).obtener(ID));

    expect(error).toBeInstanceOf(ErrorNegocio);
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });
});

describe('AlertasService.resolver', () => {
  const datos = esquemaResolverAlerta.parse({ estado: 'CONFIRMADA', nota: ' Mismo titular ' });

  it('actualiza con WHERE estado = ABIERTA, registra alerta.resuelta en la transacción y devuelve la vista', async () => {
    const { prisma, alertaFraude } = crearPrismaFalso();
    const auditoria = new AuditoriaEnMemoria();

    const vista = await crear(prisma, auditoria).resolver(ID, datos, CONTEXTO);

    expect(alertaFraude.updateMany).toHaveBeenCalledWith({
      where: { id: ID, estado: 'ABIERTA' },
      data: {
        estado: 'CONFIRMADA',
        nota: 'Mismo titular',
        resueltaPor: 'admin-1',
        resueltaEn: AHORA,
      },
    });
    expect(vista).toMatchObject({ estado: 'CONFIRMADA', resueltaPor: 'admin-1' });
    expect(auditoria.eventos).toHaveLength(1);
    expect(auditoria.eventos[0]).toMatchObject({
      enTransaccion: true,
      evento: {
        accion: 'alerta.resuelta',
        entidad: 'alerta_fraude',
        entidadId: ID,
        actorId: 'admin-1',
        datos: { estado: 'CONFIRMADA', regla: 'CUENTAS_DISPOSITIVO', usuarioId: 'u-1' },
      },
    });
  });

  it('si otra resolución ganó la carrera responde 409 ALERTA_RESUELTA y no audita', async () => {
    const { prisma } = crearPrismaFalso({
      actualizadas: 0,
      existente: alerta({ estado: 'DESCARTADA' }),
    });
    const auditoria = new AuditoriaEnMemoria();

    const error = await errorDe(crear(prisma, auditoria).resolver(ID, datos, CONTEXTO));

    expect(error).toMatchObject({ codigo: 'ALERTA_RESUELTA' });
    expect(auditoria.eventos).toHaveLength(0);
  });

  it('responde 404 si la alerta no existe', async () => {
    const { prisma } = crearPrismaFalso({ actualizadas: 0, existente: null });

    const error = await errorDe(
      crear(prisma, new AuditoriaEnMemoria()).resolver(ID, datos, CONTEXTO),
    );

    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('falla cerrada con 503 y sin escribir si no hay auditoría', async () => {
    const { prisma, alertaFraude } = crearPrismaFalso();

    const error = await errorDe(crear(prisma, undefined).resolver(ID, datos, CONTEXTO));

    expect(error).toBeInstanceOf(DependenciaNoDisponibleError);
    expect(alertaFraude.updateMany).not.toHaveBeenCalled();
  });
});
