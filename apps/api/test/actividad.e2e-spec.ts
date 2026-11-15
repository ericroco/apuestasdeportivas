import { RegistroAlertasService } from '../src/fraude/registro-alertas.service.js';
import {
  crearAppDePrueba,
  limpiarTablasSpec4,
  type AppDePrueba,
} from './utilidades/app-de-prueba.js';

// FR-017: los cinco eventos de dominio llenan actividad_usuario una sola vez aunque lleguen repetidos.
describe('Actividad observada desde los eventos de dominio (e2e)', () => {
  let contexto: AppDePrueba;

  beforeAll(async () => {
    contexto = await crearAppDePrueba();
  });

  beforeEach(async () => {
    await limpiarTablasSpec4(contexto.prisma);
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  async function emitirLosCinco(): Promise<void> {
    await contexto.emitir('usuario.registrado', {
      usuarioId: 'u-1',
      ip: '203.0.113.1',
      dispositivo: 'disp-1',
    });
    await contexto.emitir('deposito.confirmado', {
      usuarioId: 'u-1',
      depositoId: 'dep-1',
      monto: '20.00',
      codigoCupon: null,
    });
    await contexto.emitir('apuesta.aceptada', {
      usuarioId: 'u-1',
      apuestaId: 'ap-1',
      monto: '5.00',
      tipoSaldo: 'REAL',
    });
    await contexto.emitir('apuesta.liquidada', {
      usuarioId: 'u-1',
      apuestaId: 'ap-1',
      resultado: 'PERDIDA',
      monto: '5.00',
      premio: '0.00',
    });
    await contexto.emitir('retiro.solicitado', {
      usuarioId: 'u-1',
      retiroId: 'ret-1',
      monto: '10',
    });
  }

  it('registra una fila por evento aunque cada evento llegue dos veces', async () => {
    await emitirLosCinco();
    await emitirLosCinco();

    const filas = await contexto.prisma.actividadUsuario.findMany({ orderBy: { tipo: 'asc' } });

    expect(filas.map((fila) => [fila.tipo, fila.referenciaId])).toEqual([
      ['REGISTRO', 'u-1'],
      ['DEPOSITO', 'dep-1'],
      ['APUESTA_ACEPTADA', 'ap-1'],
      ['APUESTA_LIQUIDADA', 'ap-1'],
      ['RETIRO', 'ret-1'],
    ]);
    const aceptada = filas.find((fila) => fila.tipo === 'APUESTA_ACEPTADA');
    expect(aceptada?.cuota).toBeNull();
    expect(aceptada?.monto?.toFixed(2)).toBe('5.00');
  });

  it('guarda la cuota total y la huella del método de pago cuando los eventos las traen', async () => {
    await contexto.emitir('apuesta.aceptada', {
      usuarioId: 'u-1',
      apuestaId: 'ap-2',
      monto: '5.00',
      tipoSaldo: 'BONO',
      cuotaTotal: '1.85',
    } as never);
    await contexto.emitir('deposito.confirmado', {
      usuarioId: 'u-1',
      depositoId: 'dep-2',
      monto: '20.00',
      codigoCupon: null,
      metodoPagoHuella: 'f'.repeat(64),
    } as never);

    const filas = await contexto.prisma.actividadUsuario.findMany();

    expect(filas.find((fila) => fila.referenciaId === 'ap-2')?.cuota?.toFixed(2)).toBe('1.85');
    expect(filas.find((fila) => fila.referenciaId === 'dep-2')?.metodoPagoHuella).toBe(
      'f'.repeat(64),
    );
  });

  it('un evento mal formado no llega al emisor como error ni deja filas', async () => {
    await expect(
      contexto.emitir('retiro.solicitado', { usuarioId: 'u-1', retiroId: 'r-9', monto: '-5' }),
    ).resolves.toBeUndefined();

    expect(await contexto.prisma.actividadUsuario.count()).toBe(0);
  });

  it('las alertas se deduplican por clave y cuentan para el bloqueo de cupones de bono', async () => {
    const alertas = contexto.app.get(RegistroAlertasService);
    const alerta = {
      regla: 'CUPON_CUENTA_MULTIPLE',
      severidad: 'ALTA',
      usuarioId: 'u-1',
      evidencia: { cuponId: 'c-1', cuentas: ['u-1', 'u-2'] },
      claveDeduplicacion: 'cupon:u-1:c-1',
    } as const;

    expect(await alertas.registrar(alerta)).toBe(true);
    expect(await alertas.registrar(alerta)).toBe(false);
    expect(await alertas.tieneAlertaAltaVigente('u-1')).toBe(true);
    expect(await alertas.tieneAlertaAltaVigente('u-2')).toBe(false);
    const guardada = await contexto.prisma.alertaFraude.findFirstOrThrow();
    expect(guardada).toMatchObject({ estado: 'ABIERTA', evidencia: alerta.evidencia });
  });
});
