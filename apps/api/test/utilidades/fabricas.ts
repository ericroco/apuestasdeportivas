import { randomUUID } from 'node:crypto';
import type {
  CodigoSeleccion,
  EstadoMercado,
  EstadoPartido,
  TipoMercado,
} from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import type { BilleteraSqlDePrueba } from '../dobles/billetera-sql.double.js';

const UNA_HORA_MS = 60 * 60 * 1000;

export async function crearCompeticion(prisma: PrismaService, nombre = 'Liga de Prueba') {
  return prisma.competicion.create({ data: { nombre, pais: 'Ecuador' } });
}

export interface OpcionesMercado {
  readonly tipo?: TipoMercado;
  readonly linea?: string;
  readonly estado?: EstadoMercado;
  readonly admiteVivo?: boolean;
  /** Cuota por código de selección; por defecto un 1X2 con 2.10 / 3.20 / 3.50. */
  readonly cuotas?: Partial<Record<CodigoSeleccion, string>>;
}

export interface OpcionesPartido {
  readonly competicionId?: string;
  readonly nombreLocal?: string;
  readonly nombreVisitante?: string;
  /** Por defecto, dentro de una hora. */
  readonly inicioEn?: Date;
  readonly estado?: EstadoPartido;
  readonly mercados?: readonly OpcionesMercado[];
}

const CUOTAS_1X2: Partial<Record<CodigoSeleccion, string>> = {
  LOCAL: '2.10',
  EMPATE: '3.20',
  VISITANTE: '3.50',
};

/** Partido con sus mercados y selecciones; devuelve el partido con todo incluido. */
export async function crearPartidoConMercados(
  prisma: PrismaService,
  opciones: OpcionesPartido = {},
) {
  const competicionId = opciones.competicionId ?? (await crearCompeticion(prisma)).id;
  const inicioEn = opciones.inicioEn ?? new Date(Date.now() + UNA_HORA_MS);
  const mercados = opciones.mercados ?? [{}];

  return prisma.partido.create({
    data: {
      competicionId,
      nombreLocal: opciones.nombreLocal ?? `Local ${randomUUID().slice(0, 8)}`,
      nombreVisitante: opciones.nombreVisitante ?? `Visitante ${randomUUID().slice(0, 8)}`,
      inicioEn,
      inicioOriginalEn: inicioEn,
      estado: opciones.estado ?? 'PROGRAMADO',
      origen: 'OPERADOR',
      mercados: {
        create: mercados.map((mercado) => ({
          tipo: mercado.tipo ?? 'RESULTADO_FINAL',
          linea: mercado.linea ?? null,
          estado: mercado.estado ?? 'ABIERTO',
          admiteVivo: mercado.admiteVivo ?? false,
          selecciones: {
            create: Object.entries(mercado.cuotas ?? CUOTAS_1X2).map(([codigo, cuota]) => ({
              codigo: codigo as CodigoSeleccion,
              cuota: cuota as string,
            })),
          },
        })),
      },
    },
    include: { competicion: true, mercados: { include: { selecciones: true } } },
  });
}

/** Usuario apostador nuevo con saldo real (y de bono) en la billetera de prueba; devuelve su id. */
export async function crearUsuarioConSaldo(
  billetera: BilleteraSqlDePrueba,
  real = '100.00',
  bono = '0',
): Promise<string> {
  const usuarioId = `usuario-${randomUUID()}`;
  await billetera.depositar(usuarioId, real, bono);
  return usuarioId;
}
