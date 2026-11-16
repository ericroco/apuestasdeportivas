/**
 * Cuentas de demostración LOCALES para probar el Spec 3 a mano (quickstart.md §2):
 *
 *   pnpm --filter api demo:cuentas
 *
 * - `admin@demo.local`: administrador (puede usar el panel del operador) con el segundo factor ya activado.
 * - `apostador@demo.local`: apostador con el correo confirmado (por Mailpit) y 100.00 de saldo de prueba.
 *
 * Las contraseñas son aleatorias y quedan, con la clave del segundo factor, en `apps/api/.env.cuentas-demo`
 * (ignorado por git). Requiere `docker compose up -d` y `pnpm dev` corriendo: las cuentas se crean por la web
 * (proxy /api/*), como lo haría una persona. Solo para local: el saldo se acredita con un asiento de depósito de
 * prueba porque Payphone sandbox no está configurado en desarrollo.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import * as OTPAuth from 'otpauth';
import { PrismaClient } from '../src/generated/prisma/client.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const WEB = process.env['DEMO_WEB_URL'] ?? 'http://localhost:3000';
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';
// Opcionales, para tener más de un juego de cuentas en la misma base.
const ARCHIVO = process.env['DEMO_ARCHIVO'] ?? '.env.cuentas-demo';
const SALDO_INICIAL = '100.00';

const contrasena = (): string => `Demo-${randomBytes(9).toString('base64url')}-26`;
const ADMIN = {
  email: process.env['DEMO_ADMIN_EMAIL'] ?? 'admin@demo.local',
  nombre: 'Administrador Demo',
  contrasena: contrasena(),
};
const APOSTADOR = {
  email: process.env['DEMO_APOSTADOR_EMAIL'] ?? 'apostador@demo.local',
  nombre: 'Apostador Demo',
  contrasena: contrasena(),
};

type Peticion = (ruta: string, cuerpo?: unknown) => Promise<Record<string, unknown>>;

/** Cliente con cookies que entra por el proxy /api/* de la web, igual que el navegador. */
function clienteWeb(): Peticion {
  const cookies = new Map<string, string>();
  return async (ruta, cuerpo) => {
    const respuesta = await fetch(`${WEB}/api${ruta}`, {
      method: 'POST',
      headers: {
        origin: WEB,
        'content-type': 'application/json',
        cookie: [...cookies].map(([nombre, valor]) => `${nombre}=${valor}`).join('; '),
      },
      body: JSON.stringify(cuerpo ?? {}),
    });
    for (const linea of respuesta.headers.getSetCookie()) {
      const [par = ''] = linea.split(';');
      const separador = par.indexOf('=');
      cookies.set(par.slice(0, separador), par.slice(separador + 1));
    }
    const texto = await respuesta.text();
    if (!respuesta.ok)
      throw new Error(`${ruta} respondió ${respuesta.status}: ${texto.slice(0, 200)}`);
    return texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  };
}

async function tokenDelCorreo(email: string): Promise<string> {
  for (let intento = 0; intento < 40; intento++) {
    const busqueda = (await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    ).then((r) => r.json())) as { messages?: { ID: string }[] };
    for (const mensaje of busqueda.messages ?? []) {
      const { Text } = (await fetch(`${MAILPIT}/api/v1/message/${mensaje.ID}`).then((r) =>
        r.json(),
      )) as { Text: string };
      const token = /token=([A-Za-z0-9_-]+)/.exec(Text)?.[1];
      if (token) return token;
    }
    await new Promise((resolver) => setTimeout(resolver, 250));
  }
  throw new Error(`No llegó el correo de confirmación a ${email}: ¿está Mailpit arriba?`);
}

async function crearAdministrador(): Promise<{ otpauthUrl: string; recuperacion: string[] }> {
  // El script oficial (FR-028), con los datos por variables de entorno en vez de preguntar.
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/crear-administrador.ts'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_NOMBRE: ADMIN.nombre,
      ADMIN_CONTRASENA: ADMIN.contrasena,
    },
  });
  const web = clienteWeb();
  await web('/identidad/sesion', {
    email: ADMIN.email,
    contrasena: ADMIN.contrasena,
    captcha: 'demo',
  });
  const { otpauthUrl } = (await web('/identidad/2fa/activacion')) as { otpauthUrl: string };
  const { codigosRecuperacion } = (await web('/identidad/2fa/activacion/confirmar', {
    codigo: OTPAuth.URI.parse(otpauthUrl).generate(),
  })) as { codigosRecuperacion: string[] };
  return { otpauthUrl, recuperacion: codigosRecuperacion };
}

async function crearApostador(): Promise<void> {
  const web = clienteWeb();
  await web('/identidad/registro', {
    nombreCompleto: APOSTADOR.nombre,
    email: APOSTADOR.email,
    contrasena: APOSTADOR.contrasena,
    fechaNacimiento: '1995-06-15',
    declaraMayorEdad: true,
    captcha: 'demo',
  });
  await web('/identidad/correo/verificar', { token: await tokenDelCorreo(APOSTADOR.email) });
}

/** Depósito de prueba de doble entrada: pasarela → saldo real del apostador (nunca se toca un saldo). */
async function acreditarSaldo(prisma: PrismaClient, usuarioId: string): Promise<void> {
  const real = `usuario:${usuarioId}:real`;
  await prisma.$transaction(async (tx) => {
    await tx.billetera.upsert({ where: { usuarioId }, create: { usuarioId }, update: {} });
    await tx.cuentaContable.createMany({
      data: [
        { codigo: real, tipo: 'USUARIO_REAL', usuarioId },
        { codigo: `usuario:${usuarioId}:bono`, tipo: 'USUARIO_BONO', usuarioId },
      ],
      skipDuplicates: true,
    });
    const cuentas = await tx.cuentaContable.findMany({
      where: { codigo: { in: ['pasarela', real] } },
    });
    const id = (codigo: string): string => cuentas.find((c) => c.codigo === codigo)!.id;
    await tx.asiento.create({
      data: {
        tipo: 'DEPOSITO',
        claveIdempotencia: `demo:${randomUUID()}:fondeo`,
        usuarioId,
        origenTipo: 'demo-local',
        origenId: usuarioId,
        lineas: {
          create: [
            { cuentaId: id('pasarela'), monto: `-${SALDO_INICIAL}` },
            { cuentaId: id(real), monto: SALDO_INICIAL },
          ],
        },
      },
    });
  });
}

if (existsSync(ARCHIVO)) {
  console.log(`Las cuentas de demostración ya existen: credenciales en ${resolve(ARCHIVO)}.`);
  process.exit(0);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const existentes = await prisma.usuario.count({
  where: { email: { in: [ADMIN.email, APOSTADOR.email] } },
});
if (existentes > 0) {
  console.error(
    `Ya hay usuarios ${ADMIN.email} o ${APOSTADOR.email} pero falta ${resolve(ARCHIVO)} con sus contraseñas. ` +
      'Reinicia la base local (pnpm --filter api exec prisma migrate reset) y vuelve a ejecutar el script.',
  );
  await prisma.$disconnect();
  process.exit(1);
}

const admin = await crearAdministrador();
await crearApostador();
const apostador = await prisma.usuario.findUniqueOrThrow({ where: { email: APOSTADOR.email } });
await acreditarSaldo(prisma, apostador.id);
await prisma.$disconnect();

writeFileSync(
  ARCHIVO,
  `# Cuentas de demostración LOCALES (solo localhost). Ignorado por git: no lo compartas.
# Inicio de sesión: ${WEB}/iniciar-sesion

ADMIN_EMAIL=${ADMIN.email}
ADMIN_CONTRASENA=${ADMIN.contrasena}
# Segundo factor: agrega ADMIN_TOTP_SECRETO en Google o Microsoft Authenticator ("Ingresar clave de
# configuración", basada en tiempo) o genera el código con: pnpm --filter api demo:codigo
ADMIN_TOTP_SECRETO=${OTPAuth.URI.parse(admin.otpauthUrl).secret.base32}
ADMIN_TOTP_URL=${admin.otpauthUrl}
ADMIN_CODIGOS_RECUPERACION=${admin.recuperacion.join(',')}

APOSTADOR_EMAIL=${APOSTADOR.email}
APOSTADOR_CONTRASENA=${APOSTADOR.contrasena}
# Saldo de prueba inicial: ${SALDO_INICIAL} USD (asiento DEPOSITO con origen demo-local)
`,
);
console.log(
  `Listo: ${ADMIN.email} (2FA activo) y ${APOSTADOR.email} (saldo ${SALDO_INICIAL}). ` +
    `Credenciales en ${resolve(ARCHIVO)}.`,
);
