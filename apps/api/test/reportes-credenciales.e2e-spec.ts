import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// FR-064: el servicio de reportes lee la base con `reportes_lectura`, que nunca debe ver contraseñas, secretos 2FA,
// códigos de recuperación ni credenciales de sesión (research §14). Las demás tablas sí las puede leer.
const TABLAS_SENSIBLES = [
  'credencial',
  'segundo_factor',
  'codigo_recuperacion',
  'sesion',
  'enlace_correo',
] as const;

const TABLAS_LEGIBLES = ['usuario', 'evento_auditoria'] as const;

describe('Credenciales fuera del alcance de reportes (e2e)', () => {
  const url = process.env['REPORTS_DATABASE_URL'];
  if (!url) {
    // No se omite en silencio: en CI la variable siempre está y en local va en apps/api/.env.
    throw new Error(
      'Falta REPORTS_DATABASE_URL (usuario reportes_lectura); ver apps/api/.env.example',
    );
  }
  const reportes = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  afterAll(async () => {
    await reportes.$disconnect();
  });

  it('se conecta como reportes_lectura', async () => {
    const [fila] = await reportes.$queryRaw<{ usuario: string }[]>`SELECT current_user AS usuario`;

    expect(fila?.usuario).toBe('reportes_lectura');
  });

  it.each(TABLAS_SENSIBLES)('no puede leer %s', async (tabla) => {
    await expect(reportes.$queryRawUnsafe(`SELECT * FROM "${tabla}" LIMIT 1`)).rejects.toThrow(
      /permission denied|permiso denegado/i,
    );
  });

  it.each(TABLAS_LEGIBLES)('sí puede leer %s', async (tabla) => {
    await expect(
      reportes.$queryRawUnsafe(`SELECT 1 FROM "${tabla}" LIMIT 1`),
    ).resolves.toBeDefined();
  });
});
