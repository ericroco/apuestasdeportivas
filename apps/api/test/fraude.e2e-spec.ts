import request from 'supertest';
import { RIESGO_PORT, type RiesgoPort } from '../src/contracts/promociones.port.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { comoUsuario } from './dobles/guard-de-prueba.js';
import {
  crearAppDePrueba,
  limpiarTablasSpec4,
  type AppDePrueba,
} from './utilidades/app-de-prueba.js';

// HU4 y HU5: las reglas de fraude y el riesgo de retiros contra PostgreSQL real.
const ADMINISTRADOR = comoUsuario('admin-1', 'ADMINISTRADOR');
const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const APOSTADOR = comoUsuario('apostador-1', 'APOSTADOR');
const HUELLA = 'b'.repeat(64);

describe('Fraude: reglas, alertas y riesgo (e2e)', () => {
  let contexto: AppDePrueba;
  const http = () => request(contexto.app.getHttpServer());

  beforeAll(async () => {
    contexto = await crearAppDePrueba();
  });

  beforeEach(async () => {
    await limpiarTablasSpec4(contexto.prisma);
    contexto.auditoria?.reiniciar();
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  const alertas = (regla?: string) =>
    contexto.prisma.alertaFraude.findMany({
      where: regla ? { regla: regla as never } : {},
      orderBy: { creadaEn: 'asc' },
    });

  const registrar = (usuarioId: string, ip: string, dispositivo: string) =>
    contexto.emitir('usuario.registrado', { usuarioId, ip, dispositivo });

  const apostar = (usuarioId: string, apuestaId: string, monto: string) =>
    contexto.emitir('apuesta.aceptada', { usuarioId, apuestaId, monto, tipoSaldo: 'REAL' });

  const depositar = (usuarioId: string, depositoId: string, monto: string, huella?: string) =>
    contexto.emitir('deposito.confirmado', {
      usuarioId,
      depositoId,
      monto,
      codigoCupon: null,
      ...(huella && { metodoPagoHuella: huella }),
    } as never);

  describe('reglas sobre los eventos', () => {
    it('dos cuentas con el mismo dispositivo generan una alerta ALTA, una sola vez aunque el evento se repita', async () => {
      await registrar('u-1', '203.0.113.1', 'disp-1');
      await registrar('u-2', '203.0.113.2', 'disp-1');
      await registrar('u-2', '203.0.113.2', 'disp-1');

      const [alerta, ...otras] = await alertas('CUENTAS_DISPOSITIVO');

      expect(otras).toHaveLength(0);
      expect(alerta).toMatchObject({
        severidad: 'ALTA',
        usuarioId: 'u-2',
        estado: 'ABIERTA',
        claveDeduplicacion: 'dispositivo:u-2:disp-1',
        evidencia: { dispositivo: 'disp-1', cuentas: ['u-2', 'u-1'] },
      });
    });

    it('la IP con más cuentas que el umbral genera una alerta MEDIA una sola vez', async () => {
      for (const n of [1, 2, 3]) await registrar(`u-${n}`, '198.51.100.7', `d-${n}`);
      expect(await alertas('CUENTAS_IP')).toHaveLength(0);

      await registrar('u-4', '198.51.100.7', 'd-4');
      await registrar('u-4', '198.51.100.7', 'd-4');

      const [alerta, ...otras] = await alertas('CUENTAS_IP');
      expect(otras).toHaveLength(0);
      expect(alerta).toMatchObject({ severidad: 'MEDIA', usuarioId: 'u-4' });
    });

    it('un método de pago compartido genera una alerta ALTA, y sin huella no hay regla', async () => {
      await depositar('u-1', 'dep-1', '20.00', HUELLA);
      await depositar('u-2', 'dep-2', '20.00');
      expect(await alertas('METODO_PAGO_COMPARTIDO')).toHaveLength(0);

      await depositar('u-3', 'dep-3', '20.00', HUELLA);
      await depositar('u-3', 'dep-3', '20.00', HUELLA);

      const [alerta, ...otras] = await alertas('METODO_PAGO_COMPARTIDO');
      expect(otras).toHaveLength(0);
      expect(alerta).toMatchObject({ severidad: 'ALTA', usuarioId: 'u-3' });
      expect(JSON.stringify(alerta?.evidencia)).not.toContain(HUELLA);
    });

    it('una apuesta muy superior al promedio genera una alerta MEDIA una sola vez', async () => {
      for (const n of [1, 2, 3, 4, 5]) await apostar('u-1', `ap-${n}`, '10.00');
      expect(await alertas('APUESTA_MONTO_ANOMALO')).toHaveLength(0);

      await apostar('u-1', 'ap-grande', '150.00');
      await apostar('u-1', 'ap-grande', '150.00');

      const [alerta, ...otras] = await alertas('APUESTA_MONTO_ANOMALO');
      expect(otras).toHaveLength(0);
      expect(alerta).toMatchObject({
        severidad: 'MEDIA',
        claveDeduplicacion: 'monto:ap-grande',
        evidencia: { monto: '150.00', promedioPrevio: '10.00', apuestasPrevias: 5 },
      });
    });

    it('una ráfaga de apuestas genera una sola alerta aunque se repitan los eventos', async () => {
      const ids = Array.from({ length: 11 }, (_, n) => `ap-${n}`);
      for (const id of ids) await apostar('u-1', id, '5.00');
      for (const id of ids) await apostar('u-1', id, '5.00');

      const lista = await alertas('RAFAGA_APUESTAS');
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ severidad: 'MEDIA', usuarioId: 'u-1' });
    });

    it('las reglas nunca bloquean: el evento se registra aunque genere alerta', async () => {
      await registrar('u-1', '203.0.113.1', 'disp-1');
      await registrar('u-2', '203.0.113.2', 'disp-1');

      expect(await contexto.prisma.actividadUsuario.count({ where: { tipo: 'REGISTRO' } })).toBe(2);
    });
  });

  describe('API /api/alertas', () => {
    async function crearAlerta(clave = 'dispositivo:u-2:disp-1') {
      return contexto.prisma.alertaFraude.create({
        data: {
          regla: 'CUENTAS_DISPOSITIVO',
          severidad: 'ALTA',
          usuarioId: 'u-2',
          evidencia: { dispositivo: 'disp-1', cuentas: ['u-1', 'u-2'] },
          claveDeduplicacion: clave,
        },
      });
    }

    it('exige sesión (401) y rol administrador (403 para operador y apostador)', async () => {
      const alerta = await crearAlerta();
      const rutas = [
        () => http().get('/api/alertas'),
        () => http().get(`/api/alertas/${alerta.id}`),
        () =>
          http()
            .post(`/api/alertas/${alerta.id}/resolucion`)
            .send({ estado: 'CONFIRMADA', nota: 'Mismo titular' }),
      ];

      for (const ruta of rutas) {
        await ruta().expect(401);
        await ruta().set(OPERADOR).expect(403);
        await ruta().set(APOSTADOR).expect(403);
      }
      const intacta = await contexto.prisma.alertaFraude.findUniqueOrThrow({
        where: { id: alerta.id },
      });
      expect(intacta.estado).toBe('ABIERTA');
    });

    it('lista con filtros y paginación, de la más reciente a la más antigua', async () => {
      await crearAlerta('a-1');
      await crearAlerta('a-2');
      await contexto.prisma.alertaFraude.create({
        data: {
          regla: 'RAFAGA_APUESTAS',
          severidad: 'MEDIA',
          usuarioId: 'u-9',
          evidencia: {},
          claveDeduplicacion: 'rafaga:u-9:1',
        },
      });

      const todas = await http().get('/api/alertas').set(ADMINISTRADOR).expect(200);
      const altas = await http()
        .get('/api/alertas?severidad=ALTA&tamano=1&pagina=2')
        .set(ADMINISTRADOR)
        .expect(200);
      const porUsuario = await http()
        .get('/api/alertas?usuarioId=u-9&regla=RAFAGA_APUESTAS&estado=ABIERTA')
        .set(ADMINISTRADOR)
        .expect(200);

      expect(todas.body).toMatchObject({ total: 3, pagina: 1, tamano: 20 });
      expect(todas.body.datos[0].regla).toBe('RAFAGA_APUESTAS');
      expect(altas.body).toMatchObject({ total: 2, pagina: 2, tamano: 1 });
      expect(altas.body.datos).toHaveLength(1);
      expect(porUsuario.body.total).toBe(1);
      await http().get('/api/alertas?tamano=101').set(ADMINISTRADOR).expect(400);
      await http().get('/api/alertas?estado=NADA').set(ADMINISTRADOR).expect(400);
    });

    it('devuelve el detalle con la evidencia y 404 si no existe', async () => {
      const alerta = await crearAlerta();

      const detalle = await http().get(`/api/alertas/${alerta.id}`).set(ADMINISTRADOR).expect(200);
      const faltante = await http()
        .get('/api/alertas/00000000-0000-4000-8000-000000000000')
        .set(ADMINISTRADOR)
        .expect(404);

      expect(detalle.body).toMatchObject({
        id: alerta.id,
        evidencia: { dispositivo: 'disp-1' },
        nota: null,
      });
      expect(faltante.body.codigo).toBe('NO_ENCONTRADO');
    });

    it('resuelve con nota, audita alerta.resuelta y responde 409 a una segunda resolución', async () => {
      const alerta = await crearAlerta();
      const ruta = `/api/alertas/${alerta.id}/resolucion`;

      await http()
        .post(ruta)
        .set(ADMINISTRADOR)
        .send({ estado: 'CONFIRMADA', nota: 'xx' })
        .expect(400);
      const resuelta = await http()
        .post(ruta)
        .set(ADMINISTRADOR)
        .send({ estado: 'CONFIRMADA', nota: 'Mismo titular en ambas cuentas' })
        .expect(200);
      const repetida = await http()
        .post(ruta)
        .set(ADMINISTRADOR)
        .send({ estado: 'DESCARTADA', nota: 'Me equivoqué' })
        .expect(409);

      expect(resuelta.body).toMatchObject({
        estado: 'CONFIRMADA',
        nota: 'Mismo titular en ambas cuentas',
        resueltaPor: 'admin-1',
      });
      expect(resuelta.body.resueltaEn).toEqual(expect.any(String));
      expect(repetida.body.codigo).toBe('ALERTA_RESUELTA');
      expect(contexto.auditoria?.acciones()).toEqual(['alerta.resuelta']);
    });

    it('dos resoluciones simultáneas dejan una sola', async () => {
      const alerta = await crearAlerta();
      const ruta = `/api/alertas/${alerta.id}/resolucion`;

      const respuestas = await Promise.all(
        (['CONFIRMADA', 'DESCARTADA'] as const).map((estado) =>
          http()
            .post(ruta)
            .set(ADMINISTRADOR)
            .send({ estado, nota: `Decisión ${estado}` }),
        ),
      );

      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(contexto.auditoria?.acciones()).toEqual(['alerta.resuelta']);
      const final = await contexto.prisma.alertaFraude.findUniqueOrThrow({
        where: { id: alerta.id },
      });
      expect(final.nota).toBe(`Decisión ${final.estado}`);
    });
  });

  describe('RIESGO_PORT', () => {
    const d = (valor: string) => new Prisma.Decimal(valor);
    let riesgo: RiesgoPort;

    beforeAll(() => {
      riesgo = contexto.app.get<RiesgoPort>(RIESGO_PORT);
    });

    it('un retiro tras un depósito sin apostar va a revisión y crea una alerta ALTA una sola vez', async () => {
      await depositar('u-1', 'dep-1', '100.00');

      const primera = await riesgo.evaluarRetiro('u-1', d('80.00'));
      const segunda = await riesgo.evaluarRetiro('u-1', d('80.00'));

      expect(primera.requiereRevision).toBe(true);
      expect(primera.motivos).toContain('retiro_tras_deposito_sin_actividad');
      expect(segunda.requiereRevision).toBe(true);
      const lista = await alertas('RETIRO_TRAS_DEPOSITO');
      expect(lista).toHaveLength(1);
      expect(lista[0]?.claveDeduplicacion).toBe('retiro:u-1:dep-1');
    });

    it('con suficiente actividad y sin alertas el retiro no requiere revisión', async () => {
      await depositar('u-1', 'dep-1', '100.00');
      await apostar('u-1', 'ap-1', '60.00');

      expect(await riesgo.evaluarRetiro('u-1', d('80.00'))).toEqual({
        requiereRevision: false,
        motivos: [],
      });
    });

    it('un usuario sin depósitos ni alertas no requiere revisión; con alerta ALTA vigente sí', async () => {
      expect((await riesgo.evaluarRetiro('u-5', d('10.00'))).requiereRevision).toBe(false);
      await contexto.prisma.alertaFraude.create({
        data: {
          regla: 'CUPON_CUENTA_MULTIPLE',
          severidad: 'ALTA',
          usuarioId: 'u-5',
          evidencia: {},
          claveDeduplicacion: 'cupon:u-5:c-1',
        },
      });

      expect(await riesgo.evaluarRetiro('u-5', d('10.00'))).toEqual({
        requiereRevision: true,
        motivos: ['usuario_con_alerta_de_fraude'],
      });
    });
  });
});
