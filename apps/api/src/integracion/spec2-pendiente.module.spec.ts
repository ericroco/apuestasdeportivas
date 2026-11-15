import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ENTORNO } from '../config/env.js';
import { BILLETERA_PORT, type BilleteraPort } from '../contracts/index.js';
import { Spec2PendienteModule, crearAuditoriaPendiente } from './spec2-pendiente.module.js';

const EVENTO = {
  actorId: 'operador-1',
  accion: 'cuota.cambiada',
  entidad: 'seleccion',
  entidadId: 's1',
};

describe('Spec2PendienteModule', () => {
  it('la billetera de reemplazo falla cerrada con 503 y no mueve dinero', async () => {
    const modulo = await Test.createTestingModule({ imports: [Spec2PendienteModule] })
      .useMocker((token) => (token === ENTORNO ? { NODE_ENV: 'development' } : undefined))
      .compile();
    const billetera = modulo.get<BilleteraPort>(BILLETERA_PORT);

    expect(() => billetera.obtenerSaldos('usuario-1')).toThrow(ServiceUnavailableException);
  });

  it('la auditoría de reemplazo acepta el evento fuera de producción', async () => {
    await expect(
      crearAuditoriaPendiente({ NODE_ENV: 'development' }).registrar(EVENTO),
    ).resolves.toBeUndefined();
  });

  it('la auditoría de reemplazo falla cerrada en producción', async () => {
    await expect(
      crearAuditoriaPendiente({ NODE_ENV: 'production' }).registrar(EVENTO),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
