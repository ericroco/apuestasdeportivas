import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { APIRequestContext } from '@playwright/test';
import pg from 'pg';

// Spec 3 (T049, T073): preparación de datos del E2E de apuestas contra la API real. Los partidos y el saldo se
// escriben directo en PostgreSQL porque crearlos por HTTP exige un operador con segundo factor y un depósito
// confirmado por Payphone. La apuesta, que es lo que se prueba, siempre pasa por la web y la API.

// Playwright corre desde apps/web (y carga las pruebas como CommonJS, sin import.meta).
const RUTA_ENV_API = resolve(process.cwd(), '../api/.env');

function urlBaseDeDatos(): string {
  const desdeEntorno =
    process.env['PRUEBAS_DATABASE_URL_PROPIETARIO'] ?? process.env['DATABASE_URL'];
  if (desdeEntorno) return desdeEntorno;
  // En local la web no conoce la base: se toma la del .env de la API (docker compose).
  if (existsSync(RUTA_ENV_API)) {
    const url = parseEnv(readFileSync(RUTA_ENV_API, 'utf8'))['DATABASE_URL'];
    if (url) return url;
  }
  throw new Error('Define DATABASE_URL para el E2E de apuestas (o crea apps/api/.env).');
}

let pool: pg.Pool | null = null;

function base(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: urlBaseDeDatos(), max: 2 });
  return pool;
}

export async function cerrarBase(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** Ejecuta `trabajo` en una transacción con su propio cliente del pool. */
async function enTransaccion<T>(trabajo: (cliente: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await base().connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

export interface PartidoDePrueba {
  readonly id: string;
  readonly local: string;
  readonly visitante: string;
  readonly seleccionLocalId: string;
}

/** Partido por jugar (en 2 horas) con el mercado de resultado final abierto. Nombres únicos por llamada. */
export function crearPartido(cuotaLocal = '1.80'): Promise<PartidoDePrueba> {
  const sufijo = randomUUID().slice(0, 6);
  const local = `Local ${sufijo}`;
  const visitante = `Visita ${sufijo}`;
  return enTransaccion(async (cliente) => {
    const competicion = await cliente.query<{ id: string }>(
      `INSERT INTO competicion (id, nombre) VALUES (gen_random_uuid(), 'Liga E2E') RETURNING id`,
    );
    const partido = await cliente.query<{ id: string }>(
      `INSERT INTO partido (id, competicion_id, nombre_local, nombre_visitante, inicio_en, inicio_original_en,
                            origen, actualizado_en)
       VALUES (gen_random_uuid(), $1, $2, $3, now() + interval '2 hours', now() + interval '2 hours',
               'OPERADOR', now())
       RETURNING id`,
      [competicion.rows[0]!.id, local, visitante],
    );
    const partidoId = partido.rows[0]!.id;
    const mercado = await cliente.query<{ id: string }>(
      `INSERT INTO mercado (id, partido_id, tipo) VALUES (gen_random_uuid(), $1, 'RESULTADO_FINAL')
       RETURNING id`,
      [partidoId],
    );
    const selecciones = await cliente.query<{ id: string; codigo: string }>(
      `INSERT INTO seleccion (id, mercado_id, codigo, cuota)
       VALUES (gen_random_uuid(), $1, 'LOCAL', $2), (gen_random_uuid(), $1, 'EMPATE', '3.20'),
              (gen_random_uuid(), $1, 'VISITANTE', '4.10')
       RETURNING id, codigo`,
      [mercado.rows[0]!.id, cuotaLocal],
    );
    const seleccionLocalId = selecciones.rows.find((s) => s.codigo === 'LOCAL')!.id;
    return { id: partidoId, local, visitante, seleccionLocalId };
  });
}

/** El operador cambia la cuota mientras el apostador decide (sin aviso en tiempo real a esa página). */
export async function cambiarCuota(seleccionId: string, cuota: string): Promise<void> {
  await base().query('UPDATE seleccion SET cuota = $2 WHERE id = $1', [seleccionId, cuota]);
}

/** Llega la hora de inicio sin que el partido pase a "en vivo": manda el reloj del servidor (FR-017). */
export async function adelantarInicio(partidoId: string): Promise<void> {
  await base().query(
    `UPDATE partido SET inicio_en = now() - interval '1 minute', actualizado_en = now() WHERE id = $1`,
    [partidoId],
  );
}

/** Depósito de prueba en el ledger: asiento de doble entrada pasarela → saldo real del usuario. */
export function acreditarSaldo(usuarioId: string, monto: string): Promise<void> {
  const cuentaReal = `usuario:${usuarioId}:real`;
  return enTransaccion(async (cliente) => {
    await cliente.query('INSERT INTO billetera (usuario_id) VALUES ($1) ON CONFLICT DO NOTHING', [
      usuarioId,
    ]);
    await cliente.query(
      `INSERT INTO cuenta_contable (id, codigo, tipo, usuario_id)
       VALUES (gen_random_uuid(), $2, 'USUARIO_REAL', $1), (gen_random_uuid(), $3, 'USUARIO_BONO', $1)
       ON CONFLICT (codigo) DO NOTHING`,
      [usuarioId, cuentaReal, `usuario:${usuarioId}:bono`],
    );
    const asiento = await cliente.query<{ id: string }>(
      `INSERT INTO asiento (id, tipo, clave_idempotencia, usuario_id, origen_tipo, origen_id)
       VALUES (gen_random_uuid(), 'DEPOSITO', $2, $1::uuid, 'e2e', $1::text) RETURNING id`,
      [usuarioId, `e2e:${randomUUID()}:fondeo`],
    );
    await cliente.query(
      `INSERT INTO linea_asiento (id, asiento_id, cuenta_id, monto)
       SELECT gen_random_uuid(), $1, c.id,
              CASE WHEN c.codigo = 'pasarela' THEN -($3::numeric) ELSE $3::numeric END
       FROM cuenta_contable c WHERE c.codigo IN ('pasarela', $2)`,
      [asiento.rows[0]!.id, cuentaReal, monto],
    );
  });
}

export async function saldoReal(usuarioId: string): Promise<string> {
  const { rows } = await base().query<{ saldo: string }>(
    `SELECT COALESCE(SUM(l.monto), 0)::numeric(14, 2)::text AS saldo
     FROM linea_asiento l JOIN cuenta_contable c ON c.id = l.cuenta_id WHERE c.codigo = $1`,
    [`usuario:${usuarioId}:real`],
  );
  return rows[0]!.saldo;
}

export async function apuestasDe(usuarioId: string): Promise<number> {
  const { rows } = await base().query<{ total: string }>(
    'SELECT count(*)::text AS total FROM apuesta WHERE usuario_id = $1',
    [usuarioId],
  );
  return Number(rows[0]!.total);
}

export interface Apostador {
  readonly id: string;
  readonly email: string;
}

const CONTRASENA = 'Clave-E2E-Apuestas-2026';

/**
 * Registra un apostador por la web (proxy /api/*), da por confirmado su correo en la base y abre su sesión: las
 * cookies quedan en `peticiones`. Turnstile usa la clave de prueba de Cloudflare, que acepta cualquier token.
 */
export async function crearApostador(
  peticiones: APIRequestContext,
  origen: string,
): Promise<Apostador> {
  const email = `e2e-apuestas-${randomUUID()}@prueba.local`;
  const cabeceras = { origin: origen };
  const registro = await peticiones.post('/api/identidad/registro', {
    headers: cabeceras,
    data: {
      nombreCompleto: 'Apostador E2E',
      email,
      contrasena: CONTRASENA,
      fechaNacimiento: '1994-03-10',
      declaraMayorEdad: true,
      captcha: 'token-e2e',
    },
  });
  if (!registro.ok()) throw new Error(`Registro rechazado: ${registro.status()}`);

  const { rows } = await base().query<{ id: string }>(
    `UPDATE usuario SET estado = 'ACTIVO', correo_verificado_en = now(), actualizado_en = now()
     WHERE email = $1 RETURNING id`,
    [email],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No se encontró el usuario ${email}`);

  const sesion = await peticiones.post('/api/identidad/sesion', {
    headers: cabeceras,
    data: { email, contrasena: CONTRASENA, captcha: 'token-e2e' },
  });
  if (!sesion.ok()) throw new Error(`Inicio de sesión rechazado: ${sesion.status()}`);
  return { id, email };
}
