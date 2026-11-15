import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Datos de demostración del Spec 4 (T063): cupones de los tres tipos y alertas de ejemplo. Es idempotente
 * (upsert por código de cupón y por clave de deduplicación) y no mueve dinero ni crea bonos.
 * Uso: `pnpm --filter api db:seed:spec4` con `DATABASE_URL` apuntando a una base de desarrollo.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const d = (valor: string) => new Prisma.Decimal(valor);
const VIGENCIA = {
  iniciaEn: new Date('2026-01-01T00:00:00Z'),
  terminaEn: new Date('2099-01-01T00:00:00Z'),
};
const CREADO_POR = 'seed-spec4';

const CUPONES: readonly Prisma.CuponCreateInput[] = [
  {
    codigo: 'BIENVENIDA',
    tipo: 'BONO_DEPOSITO',
    porcentaje: d('100'),
    topeBono: d('50.00'),
    depositoMinimo: d('10.00'),
    cupoTotal: 500,
    creadoPor: CREADO_POR,
    ...VIGENCIA,
  },
  {
    codigo: 'GRATIS5',
    tipo: 'APUESTA_GRATIS',
    montoFijo: d('5.00'),
    cupoTotal: 100,
    creadoPor: CREADO_POR,
    ...VIGENCIA,
  },
  {
    codigo: 'CUOTA10',
    tipo: 'AUMENTO_CUOTA',
    porcentaje: d('10'),
    apuestaMaxima: d('50.00'),
    cupoTotal: 200,
    limitePorUsuario: 2,
    creadoPor: CREADO_POR,
    ...VIGENCIA,
  },
];

const ALERTAS: readonly Prisma.AlertaFraudeCreateInput[] = [
  {
    regla: 'CUENTAS_DISPOSITIVO',
    severidad: 'ALTA',
    usuarioId: 'demo-usuario-2',
    evidencia: { dispositivo: 'demo-dispositivo-1', cuentas: ['demo-usuario-2', 'demo-usuario-1'] },
    claveDeduplicacion: 'dispositivo:demo-usuario-2:demo-dispositivo-1',
  },
  {
    regla: 'CUENTAS_IP',
    severidad: 'MEDIA',
    usuarioId: 'demo-usuario-4',
    evidencia: {
      ip: '203.0.113.50',
      cuentas: ['demo-usuario-1', 'demo-usuario-2', 'demo-usuario-3', 'demo-usuario-4'],
      umbral: 3,
      ventanaHoras: 24,
    },
    claveDeduplicacion: 'ip:demo-usuario-4:203.0.113.50',
  },
  {
    regla: 'APUESTA_MONTO_ANOMALO',
    severidad: 'MEDIA',
    usuarioId: 'demo-usuario-1',
    evidencia: {
      apuestaId: 'demo-apuesta-1',
      monto: '150.00',
      promedioPrevio: '10.00',
      factor: 10,
    },
    claveDeduplicacion: 'monto:demo-apuesta-1',
  },
  {
    regla: 'RETIRO_TRAS_DEPOSITO',
    severidad: 'ALTA',
    usuarioId: 'demo-usuario-3',
    evidencia: {
      depositoId: 'demo-deposito-1',
      deposito: '100.00',
      apostado: '0.00',
      retiro: '80.00',
    },
    claveDeduplicacion: 'retiro:demo-usuario-3:demo-deposito-1',
    estado: 'DESCARTADA',
    nota: 'Cliente verificado por soporte',
    resueltaPor: CREADO_POR,
    resueltaEn: new Date('2026-11-10T15:00:00Z'),
  },
];

async function sembrar(prisma: PrismaClient): Promise<void> {
  for (const cupon of CUPONES) {
    await prisma.cupon.upsert({ where: { codigo: cupon.codigo }, create: cupon, update: {} });
  }
  for (const alerta of ALERTAS) {
    await prisma.alertaFraude.upsert({
      where: { claveDeduplicacion: alerta.claveDeduplicacion },
      create: alerta,
      update: {},
    });
  }
}

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('El seed de demostración no se ejecuta en producción.');
  }
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL no está definida.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await sembrar(prisma);
    process.stdout.write(
      `Seed del Spec 4: ${CUPONES.length} cupones y ${ALERTAS.length} alertas.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
