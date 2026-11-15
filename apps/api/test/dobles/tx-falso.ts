import type { Mock } from 'vitest';
import type { ClienteTransaccional } from '../../src/contracts/billetera.port.js';
import type { Bono, CanjeCupon, Cupon } from '../../src/generated/prisma/client.js';

export interface OpcionesTxFalso {
  /** Cupón que devuelve el bloqueo `SELECT … FOR UPDATE` (nulo: el código no existe). */
  readonly cupon?: Cupon | null;
  /** Canjes aceptados del usuario en el cupón. */
  readonly aceptadosDelUsuario?: number;
  readonly bonoActivo?: Bono | null;
  /** Canje aceptado del mismo cupón por una cuenta relacionada. */
  readonly canjeDeOtraCuenta?: { usuarioId: string } | null;
}

export interface TxFalso {
  readonly $queryRaw: Mock;
  readonly $executeRaw: Mock;
  readonly cupon: { readonly findUnique: Mock; readonly update: Mock };
  readonly canjeCupon: { readonly count: Mock; readonly findFirst: Mock; readonly create: Mock };
  readonly bono: { readonly updateMany: Mock; readonly findFirst: Mock; readonly create: Mock };
}

/** Cliente transaccional falso para las pruebas unitarias de canje y bonos: registra las llamadas. */
export function crearTxFalso(opciones: OpcionesTxFalso = {}): {
  falso: TxFalso;
  tx: ClienteTransaccional;
} {
  const cupon = opciones.cupon ?? null;
  const falso: TxFalso = {
    $queryRaw: vi.fn().mockResolvedValue(cupon ? [{ id: cupon.id }] : []),
    $executeRaw: vi.fn().mockResolvedValue(1),
    cupon: {
      findUnique: vi.fn().mockResolvedValue(cupon),
      update: vi.fn().mockResolvedValue(cupon),
    },
    canjeCupon: {
      count: vi.fn().mockResolvedValue(opciones.aceptadosDelUsuario ?? 0),
      findFirst: vi.fn().mockResolvedValue(opciones.canjeDeOtraCuenta ?? null),
      create: vi.fn(
        async ({ data }: { data: Partial<CanjeCupon> }): Promise<Partial<CanjeCupon>> => ({
          id: 'canje-1',
          creadoEn: new Date('2026-11-15T12:00:00Z'),
          ...data,
        }),
      ),
    },
    bono: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(opciones.bonoActivo ?? null),
      create: vi.fn(async ({ data }: { data: Partial<Bono> }): Promise<Partial<Bono>> => ({
        id: 'bono-1',
        ...data,
      })),
    },
  };
  return { falso, tx: falso as unknown as ClienteTransaccional };
}
