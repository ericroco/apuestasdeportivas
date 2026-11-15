import {
  apuestaGratisDePrueba,
  bonoDepositoDePrueba,
  cuponDePrueba,
} from '../../test/fabricas/promociones.js';
import type { Reloj } from '../comun/reloj.js';
import type { Cupon } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CanjeService } from './canje.service.js';
import { VistaPreviaService, describirCupon } from './vista-previa.service.js';

const AHORA = new Date('2026-11-15T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };

function preparar(cupon: Cupon | null, motivoDelUsuario: string | null = null) {
  const prisma = { cupon: { findUnique: vi.fn().mockResolvedValue(cupon) } };
  const canje = { motivoDelUsuario: vi.fn().mockResolvedValue(motivoDelUsuario) };
  const servicio = new VistaPreviaService(
    prisma as unknown as PrismaService,
    canje as unknown as CanjeService,
    reloj,
  );
  return { servicio, prisma, canje };
}

describe('describirCupon', () => {
  it('describe cada tipo con su valor y sus condiciones', () => {
    expect(describirCupon(bonoDepositoDePrueba())).toBe(
      'Bono del 100 % de tu depósito, hasta 10.00. Depósito mínimo 10.00.',
    );
    expect(describirCupon(apuestaGratisDePrueba())).toBe('Apuesta gratis de hasta 5.00.');
    expect(describirCupon(cuponDePrueba())).toBe(
      'Aumento del 10 % sobre la cuota total, en apuestas de hasta 50.00.',
    );
  });
});

describe('VistaPreviaService.previsualizar', () => {
  it('un cupón usable responde puedeUsar sin consumirlo ni alertar', async () => {
    const cupon = cuponDePrueba();
    const { servicio, canje, prisma } = preparar(cupon);

    const vista = await servicio.previsualizar('u-1', ' cuota10 ');

    expect(prisma.cupon.findUnique).toHaveBeenCalledWith({ where: { codigo: 'CUOTA10' } });
    expect(vista).toEqual({
      codigo: 'CUOTA10',
      tipo: 'AUMENTO_CUOTA',
      descripcion: expect.stringContaining('Aumento del 10 %'),
      terminaEn: cupon.terminaEn.toISOString(),
      puedeUsar: true,
      motivo: null,
    });
    expect(canje.motivoDelUsuario).toHaveBeenCalledWith(
      prisma,
      cupon,
      { usuarioId: 'u-1', origen: 'APUESTA' },
      { alertar: false },
    );
  });

  it('un código con formato inválido responde inexistente sin consultar la base', async () => {
    const { servicio, prisma } = preparar(null);

    const vista = await servicio.previsualizar('u-1', 'a$');

    expect(vista).toMatchObject({
      tipo: null,
      puedeUsar: false,
      motivo: { codigo: 'CUPON_INEXISTENTE' },
    });
    expect(prisma.cupon.findUnique).not.toHaveBeenCalled();
  });

  it('un cupón agotado explica el motivo sin evaluar al usuario', async () => {
    const { servicio, canje } = preparar(cuponDePrueba({ canjes: 10 }));

    const vista = await servicio.previsualizar('u-1', 'CUOTA10');

    expect(vista.motivo).toEqual({ codigo: 'CUPON_AGOTADO', mensaje: 'El cupón se agotó.' });
    expect(canje.motivoDelUsuario).not.toHaveBeenCalled();
  });

  it('un bono de depósito se evalúa como depósito e informa el motivo del usuario', async () => {
    const { servicio, canje } = preparar(bonoDepositoDePrueba(), 'BONO_ACTIVO');

    const vista = await servicio.previsualizar('u-1', 'BIENVENIDA10');

    expect(vista).toMatchObject({ puedeUsar: false, motivo: { codigo: 'BONO_ACTIVO' } });
    expect(canje.motivoDelUsuario.mock.calls[0]?.[2]).toEqual({
      usuarioId: 'u-1',
      origen: 'DEPOSITO',
    });
  });
});
