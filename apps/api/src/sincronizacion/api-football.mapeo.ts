import type { CodigoSeleccion, EstadoPartido } from '@apuestas/shared';
import { z } from 'zod';
import { aTexto, Decimal } from '../comun/decimal.js';
import { validarMercado } from '../partidos/mercados.js';
import type {
  CuotasPartidoProveedor,
  MercadoProveedor,
  PartidoProveedor,
} from './proveedor-deportivo.port.js';

/**
 * Traducción de las respuestas de API-Football v3 a nuestro modelo (research.md §10).
 * Las respuestas son datos externos: se validan con zod y lo que no encaja se descarta, nunca se adivina.
 * Puntos "(verificar)" de research.md: códigos de estado, score.fulltime y nombres de mercados (T029).
 */

export interface RespuestaApiFootball<T> {
  readonly errors: unknown;
  readonly paging?: { readonly current: number; readonly total: number };
  readonly response: T[];
}

const ESTADOS: Readonly<Record<string, EstadoPartido>> = {
  TBD: 'PROGRAMADO',
  NS: 'PROGRAMADO',
  '1H': 'EN_VIVO',
  HT: 'EN_VIVO',
  '2H': 'EN_VIVO',
  ET: 'EN_VIVO',
  BT: 'EN_VIVO',
  P: 'EN_VIVO',
  LIVE: 'EN_VIVO',
  SUSP: 'SUSPENDIDO',
  INT: 'SUSPENDIDO',
  ABD: 'SUSPENDIDO',
  PST: 'APLAZADO',
  FT: 'FINALIZADO',
  AET: 'FINALIZADO',
  PEN: 'FINALIZADO',
  CANC: 'CANCELADO',
  AWD: 'CANCELADO',
  WO: 'CANCELADO',
};

export function mapearEstado(codigo: string): EstadoPartido | null {
  return ESTADOS[codigo] ?? null;
}

const goles = z.number().int().min(0).nullable();
const marcador = z.object({ home: goles, away: goles });

const esquemaPartido = z.object({
  fixture: z.object({
    id: z.number().int(),
    date: z.iso.datetime({ offset: true }),
    status: z.object({ short: z.string(), elapsed: z.number().int().nullable() }),
  }),
  league: z.object({
    id: z.number().int(),
    name: z.string(),
    country: z.string().nullable(),
  }),
  teams: z.object({ home: z.object({ name: z.string() }), away: z.object({ name: z.string() }) }),
  goals: marcador,
  score: z.object({ fulltime: marcador }),
});

export function mapearPartido(dato: unknown): PartidoProveedor | null {
  const lectura = esquemaPartido.safeParse(dato);
  if (!lectura.success) return null;
  const { fixture, league, teams, goals, score } = lectura.data;
  const estado = mapearEstado(fixture.status.short);
  if (!estado) return null;

  // Finalizado: marcador del tiempo reglamentario, sin prórroga ni penales (FR-004).
  const finalizado = estado === 'FINALIZADO';
  const actual = finalizado && score.fulltime.home !== null ? score.fulltime : goals;
  return {
    idProveedor: fixture.id,
    competicion: {
      idProveedor: league.id,
      nombre: league.name,
      pais: league.country,
    },
    nombreLocal: teams.home.name,
    nombreVisitante: teams.away.name,
    inicioEn: new Date(fixture.date),
    estado,
    golesLocal: actual.home,
    golesVisitante: actual.away,
    minuto: estado === 'EN_VIVO' ? fixture.status.elapsed : null,
  };
}

const esquemaCuotas = z.object({
  fixture: z.object({ id: z.number().int() }),
  bookmakers: z
    .array(
      z.object({
        bets: z.array(
          z.object({
            name: z.string(),
            values: z.array(
              z.object({ value: z.union([z.string(), z.number()]), odd: z.string() }),
            ),
          }),
        ),
      }),
    )
    .min(1),
});

type Apuesta = z.infer<typeof esquemaCuotas>['bookmakers'][number]['bets'][number];

const SELECCIONES_FIJAS: Readonly<
  Record<string, { tipo: MercadoProveedor['tipo']; valores: Record<string, CodigoSeleccion> }>
> = {
  'Match Winner': {
    tipo: 'RESULTADO_FINAL',
    valores: { Home: 'LOCAL', Draw: 'EMPATE', Away: 'VISITANTE' },
  },
  'Double Chance': {
    tipo: 'DOBLE_OPORTUNIDAD',
    valores: {
      'Home/Draw': 'LOCAL_EMPATE',
      'Draw/Away': 'EMPATE_VISITANTE',
      'Home/Away': 'LOCAL_VISITANTE',
    },
  },
  'Both Teams Score': { tipo: 'AMBOS_MARCAN', valores: { Yes: 'SI', No: 'NO' } },
};

const PATRON_GOLES = /^(Over|Under) (\d+(?:\.\d)?)$/;

/**
 * Cuotas pre-partido; solo mercados completos y válidos (FR-004). Cada mercado sale del primer corredor que lo
 * publica completo, en el orden del proveedor: no todos publican todos (en T029 el primero no traía goles).
 */
export function mapearCuotas(dato: unknown): CuotasPartidoProveedor | null {
  const lectura = esquemaCuotas.safeParse(dato);
  if (!lectura.success) return null;
  const porMercado = new Map<string, MercadoProveedor>();
  for (const { bets } of lectura.data.bookmakers) {
    const candidatos = bets.flatMap((apuesta) =>
      apuesta.name === 'Goals Over/Under' ? mercadosDeGoles(apuesta) : mercadoFijo(apuesta),
    );
    for (const mercado of candidatos.filter(esValido)) {
      const clave = `${mercado.tipo}:${mercado.linea ?? ''}`;
      if (!porMercado.has(clave)) porMercado.set(clave, mercado);
    }
  }
  return { idProveedorPartido: lectura.data.fixture.id, mercados: [...porMercado.values()] };
}

function mercadoFijo(apuesta: Apuesta): MercadoProveedor[] {
  const definicion = SELECCIONES_FIJAS[apuesta.name];
  if (!definicion) return [];
  const selecciones = Object.entries(definicion.valores).map(([valor, codigo]) => ({
    codigo,
    cuota: normalizarCuota(apuesta.values.find((v) => String(v.value) === valor)?.odd),
  }));
  return [{ tipo: definicion.tipo, linea: null, selecciones }];
}

function mercadosDeGoles(apuesta: Apuesta): MercadoProveedor[] {
  const porLinea = new Map<string, { MAS?: string; MENOS?: string }>();
  for (const { value, odd } of apuesta.values) {
    const coincidencia = PATRON_GOLES.exec(String(value));
    if (!coincidencia?.[1] || !coincidencia[2]) continue;
    const linea = Number(coincidencia[2]).toFixed(1);
    const lado = coincidencia[1] === 'Over' ? 'MAS' : 'MENOS';
    porLinea.set(linea, { ...porLinea.get(linea), [lado]: normalizarCuota(odd) });
  }
  return [...porLinea].map(([linea, cuotas]) => ({
    tipo: 'MAS_MENOS_GOLES',
    linea,
    selecciones: [
      { codigo: 'MAS', cuota: cuotas.MAS ?? '' },
      { codigo: 'MENOS', cuota: cuotas.MENOS ?? '' },
    ],
  }));
}

function normalizarCuota(odd: string | undefined): string {
  if (!odd || !/^\d+(\.\d+)?$/.test(odd)) return '';
  return aTexto(new Decimal(odd));
}

/** Mismas reglas que un mercado del operador: selecciones completas, línea .5 y cuotas > 1.00. */
function esValido(mercado: MercadoProveedor): boolean {
  try {
    validarMercado(mercado);
    return true;
  } catch {
    return false;
  }
}
