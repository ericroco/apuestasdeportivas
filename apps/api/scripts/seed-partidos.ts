/**
 * Datos de demostración del Spec 3 (T038, research.md §14): competiciones, partidos y mercados con cuotas para la
 * demo en modo simulación (SC-008) y para el E2E de Playwright.
 *
 *   pnpm --filter api seed:partidos
 *
 * Es idempotente: si la competición de demo ya tiene partidos por jugar, no crea nada. Las horas son relativas a
 * "ahora", así que siempre hay partidos próximos. No arranca Nest: tsx no emite los metadatos de decoradores.
 */
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  type CodigoSeleccion,
  type EstadoPartido,
  PrismaClient,
  type TipoMercado,
} from '../src/generated/prisma/client.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;

interface MercadoDemo {
  readonly tipo: TipoMercado;
  readonly linea?: string;
  readonly admiteVivo?: boolean;
  readonly cuotas: Partial<Record<CodigoSeleccion, string>>;
}

interface PartidoDemo {
  readonly local: string;
  readonly visitante: string;
  readonly enMs: number;
  readonly estado?: EstadoPartido;
  readonly mercados: readonly MercadoDemo[];
}

const mercadosCompletos = (l: string, e: string, v: string): MercadoDemo[] => [
  { tipo: 'RESULTADO_FINAL', cuotas: { LOCAL: l, EMPATE: e, VISITANTE: v } },
  {
    tipo: 'DOBLE_OPORTUNIDAD',
    cuotas: { LOCAL_EMPATE: '1.30', EMPATE_VISITANTE: '1.75', LOCAL_VISITANTE: '1.33' },
  },
  {
    tipo: 'MAS_MENOS_GOLES',
    linea: '2.5',
    admiteVivo: true,
    cuotas: { MAS: '1.95', MENOS: '1.85' },
  },
  { tipo: 'AMBOS_MARCAN', admiteVivo: true, cuotas: { SI: '1.80', NO: '1.95' } },
];

const COMPETICIONES: ReadonlyArray<{ nombre: string; pais: string; partidos: PartidoDemo[] }> = [
  {
    nombre: 'LigaPro (demo)',
    pais: 'Ecuador',
    partidos: [
      {
        local: 'Barcelona SC',
        visitante: 'Emelec',
        enMs: 30 * MINUTO,
        mercados: mercadosCompletos('2.10', '3.20', '3.40'),
      },
      {
        local: 'LDU Quito',
        visitante: 'Independiente del Valle',
        enMs: 2 * HORA,
        mercados: mercadosCompletos('2.45', '3.10', '2.80'),
      },
      {
        local: 'Aucas',
        visitante: 'El Nacional',
        enMs: 26 * HORA,
        mercados: mercadosCompletos('1.95', '3.30', '3.90'),
      },
      {
        local: 'Universidad Católica',
        visitante: 'Orense',
        enMs: -20 * MINUTO,
        estado: 'EN_VIVO',
        mercados: mercadosCompletos('1.70', '3.60', '4.75').filter((m) => m.admiteVivo),
      },
    ],
  },
  {
    nombre: 'Copa Demo Internacional',
    pais: 'Internacional',
    partidos: [
      {
        local: 'Atlético Andino',
        visitante: 'Deportivo Pacífico',
        enMs: 3 * HORA,
        mercados: mercadosCompletos('2.30', '3.00', '3.10'),
      },
      {
        local: 'Real Cordillera',
        visitante: 'Unión del Sur',
        enMs: 50 * HORA,
        mercados: mercadosCompletos('1.85', '3.50', '4.20'),
      },
    ],
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] ?? '' }),
});

async function sembrarCompeticion(definicion: (typeof COMPETICIONES)[number]): Promise<number> {
  const existente = await prisma.competicion.findFirst({ where: { nombre: definicion.nombre } });
  const competicion =
    existente ??
    (await prisma.competicion.create({
      data: { nombre: definicion.nombre, pais: definicion.pais },
    }));
  const porJugar = await prisma.partido.count({
    where: { competicionId: competicion.id, estado: { in: ['PROGRAMADO', 'EN_VIVO'] } },
  });
  if (porJugar > 0) return 0;

  for (const partido of definicion.partidos) {
    const inicioEn = new Date(Date.now() + partido.enMs);
    const enVivo = partido.estado === 'EN_VIVO';
    const creado = await prisma.partido.create({
      data: {
        competicionId: competicion.id,
        nombreLocal: partido.local,
        nombreVisitante: partido.visitante,
        inicioEn,
        inicioOriginalEn: inicioEn,
        estado: partido.estado ?? 'PROGRAMADO',
        golesLocal: enVivo ? 1 : null,
        golesVisitante: enVivo ? 0 : null,
        minuto: enVivo ? 20 : null,
        origen: 'SIMULACION',
        mercados: {
          create: partido.mercados.map((mercado) => ({
            tipo: mercado.tipo,
            linea: mercado.linea ?? null,
            admiteVivo: mercado.admiteVivo ?? false,
            selecciones: {
              create: Object.entries(mercado.cuotas).map(([codigo, cuota]) => ({
                codigo: codigo as CodigoSeleccion,
                cuota: cuota as string,
              })),
            },
          })),
        },
      },
      include: { mercados: { include: { selecciones: true } } },
    });
    // Historial inicial: cada cuota tiene su primer valor registrado, como si la hubiera cargado alguien.
    await prisma.historialCuota.createMany({
      data: creado.mercados.flatMap((m) =>
        m.selecciones.map((s) => ({
          seleccionId: s.id,
          cuotaNueva: s.cuota,
          origen: 'SIMULACION' as const,
        })),
      ),
    });
  }
  return definicion.partidos.length;
}

try {
  let creados = 0;
  for (const competicion of COMPETICIONES) creados += await sembrarCompeticion(competicion);
  process.stdout.write(
    creados > 0
      ? `Datos de demostración creados: ${creados} partidos.\n`
      : 'Los datos de demostración ya existían: no se creó nada.\n',
  );
} finally {
  await prisma.$disconnect();
}
