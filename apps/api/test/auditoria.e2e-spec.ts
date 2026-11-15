import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { AuditoriaModule } from '../src/auditoria/auditoria.module.js';
import { ConfiguracionModule } from '../src/config/configuracion.module.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../src/contracts/auditoria.port.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// AUDITORIA_PORT real (contrato 3, FR-029 a FR-032) contra PostgreSQL.
describe('Auditoría (e2e)', () => {
  let auditoria: AuditoriaPort;
  let prisma: PrismaService;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfiguracionModule, PrismaModule, AuditoriaModule],
    }).compile();
    auditoria = modulo.get(AUDITORIA_PORT);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const buscar = (entidadId: string) => prisma.eventoAuditoria.findMany({ where: { entidadId } });

  it('registra quién, qué, cuándo, IP y dispositivo', async () => {
    const entidadId = randomUUID();
    await auditoria.registrar({
      actorId: randomUUID(),
      accion: 'prueba.registrada',
      entidad: 'prueba',
      entidadId,
      ip: '203.0.113.7',
      dispositivo: 'Mozilla/5.0 (prueba)',
    });

    const [evento] = await buscar(entidadId);
    expect(evento).toMatchObject({ accion: 'prueba.registrada', ip: '203.0.113.7' });
    expect(evento?.creadoEn).toBeInstanceOf(Date);
  });

  it('nunca guarda contraseñas, tokens, códigos ni datos de tarjeta, aunque vengan anidados', async () => {
    const entidadId = randomUUID();
    await auditoria.registrar({
      actorId: null,
      accion: 'prueba.registrada',
      entidad: 'prueba',
      entidadId,
      datos: {
        contrasena: 'NoDebeGuardarse123',
        monto: '10.00',
        pasarela: { token: 'tok_secreto', lastDigits: '4242', cardNumber: '4111111111111111' },
        codigos: [{ codigo2fa: '123456' }],
      },
    });

    const [evento] = await buscar(entidadId);
    const texto = JSON.stringify(evento?.datos);
    expect(texto).not.toMatch(/NoDebeGuardarse123|tok_secreto|4111111111111111|123456/);
    expect(evento?.datos).toMatchObject({ monto: '10.00', pasarela: { lastDigits: '4242' } });
  });

  it('con tx, el evento se revierte junto con la acción auditada', async () => {
    const entidadId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await auditoria.registrar(
          { actorId: null, accion: 'prueba.revertida', entidad: 'prueba', entidadId },
          tx,
        );
        throw new Error('la acción falló');
      }),
    ).rejects.toThrow('la acción falló');

    expect(await buscar(entidadId)).toHaveLength(0);
  });
});
