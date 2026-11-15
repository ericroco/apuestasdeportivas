import request from 'supertest';
import { comoUsuario } from './dobles/guard-de-prueba.js';
import {
  crearAppDePrueba,
  limpiarTablasSpec4,
  type AppDePrueba,
} from './utilidades/app-de-prueba.js';

// HU1: gestión de cupones por el operador, contra PostgreSQL real con los dobles del Spec 2.
const OPERADOR = comoUsuario('operador-1', 'OPERADOR');
const ADMINISTRADOR = comoUsuario('admin-1', 'ADMINISTRADOR');
const APOSTADOR = comoUsuario('apostador-1', 'APOSTADOR');

const aumentoCuota = {
  codigo: 'cuota10',
  tipo: 'AUMENTO_CUOTA',
  porcentaje: '10',
  apuestaMaxima: '50.00',
  iniciaEn: '2026-01-01T00:00:00Z',
  terminaEn: '2099-01-01T00:00:00Z',
  cupoTotal: 100,
};

const bonoDeposito = {
  codigo: 'BIENVENIDA',
  tipo: 'BONO_DEPOSITO',
  porcentaje: '100',
  topeBono: '10',
  depositoMinimo: '10',
  iniciaEn: '2026-01-01T00:00:00Z',
  terminaEn: '2099-01-01T00:00:00Z',
  cupoTotal: 500,
};

describe('API /api/cupones (e2e)', () => {
  let contexto: AppDePrueba;
  const http = () => request(contexto.app.getHttpServer());

  beforeAll(async () => {
    contexto = await crearAppDePrueba();
  });

  beforeEach(async () => {
    await limpiarTablasSpec4(contexto.prisma);
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  it('crea un cupón activo con 0 canjes y lo audita', async () => {
    const respuesta = await http()
      .post('/api/cupones')
      .set(OPERADOR)
      .send(aumentoCuota)
      .expect(201);

    expect(respuesta.body).toMatchObject({
      codigo: 'CUOTA10',
      tipo: 'AUMENTO_CUOTA',
      porcentaje: '10.00',
      apuestaMaxima: '50.00',
      montoFijo: null,
      canjes: 0,
      estado: 'ACTIVO',
      vigente: true,
    });
    expect(contexto.auditoria?.acciones()).toContain('cupon.creado');
  });

  it('rechaza un código repetido sin distinguir mayúsculas (409 CODIGO_DUPLICADO)', async () => {
    await http().post('/api/cupones').set(OPERADOR).send(bonoDeposito).expect(201);

    const respuesta = await http()
      .post('/api/cupones')
      .set(ADMINISTRADOR)
      .send({ ...bonoDeposito, codigo: 'bienvenida' })
      .expect(409);

    expect(respuesta.body).toMatchObject({ statusCode: 409, codigo: 'CODIGO_DUPLICADO' });
  });

  it('rechaza datos inválidos nombrando el campo (400 DATOS_INVALIDOS) y no crea nada', async () => {
    const respuesta = await http()
      .post('/api/cupones')
      .set(OPERADOR)
      .send({ ...aumentoCuota, porcentaje: '150', cupoTotal: 0 })
      .expect(400);

    expect(respuesta.body).toMatchObject({ statusCode: 400, codigo: 'DATOS_INVALIDOS' });
    expect(respuesta.body.message).toMatch(/porcentaje/);
    expect(respuesta.body.message).toMatch(/cupoTotal/);
    expect(await contexto.prisma.cupon.count()).toBe(0);
  });

  it('lista con filtros y paginación, del más reciente al más antiguo', async () => {
    await http().post('/api/cupones').set(OPERADOR).send(aumentoCuota).expect(201);
    await http().post('/api/cupones').set(OPERADOR).send(bonoDeposito).expect(201);

    const todos = await http().get('/api/cupones').set(OPERADOR).expect(200);
    const filtrados = await http()
      .get('/api/cupones?tipo=BONO_DEPOSITO&busqueda=bien&tamano=1')
      .set(OPERADOR)
      .expect(200);

    expect(todos.body).toMatchObject({ total: 2, pagina: 1, tamano: 20 });
    expect(todos.body.datos.map((c: { codigo: string }) => c.codigo)).toEqual([
      'BIENVENIDA',
      'CUOTA10',
    ]);
    expect(filtrados.body).toMatchObject({ total: 1, tamano: 1 });
    expect(filtrados.body.datos[0].codigo).toBe('BIENVENIDA');
  });

  it('muestra el detalle con el resumen de canjes', async () => {
    const creado = await http().post('/api/cupones').set(OPERADOR).send(aumentoCuota).expect(201);

    const detalle = await http().get(`/api/cupones/${creado.body.id}`).set(OPERADOR).expect(200);

    expect(detalle.body).toMatchObject({
      codigo: 'CUOTA10',
      resumenCanjes: { aceptados: 0, rechazados: 0, bonoOtorgado: '0.00' },
    });
  });

  it('responde 404 NO_ENCONTRADO para un cupón inexistente', async () => {
    const respuesta = await http()
      .get('/api/cupones/00000000-0000-4000-8000-000000000000')
      .set(OPERADOR)
      .expect(404);

    expect(respuesta.body.codigo).toBe('NO_ENCONTRADO');
  });

  it('pausa, reactiva, extiende y amplía con auditoría', async () => {
    const creado = await http().post('/api/cupones').set(OPERADOR).send(aumentoCuota).expect(201);
    const ruta = `/api/cupones/${creado.body.id}`;

    const pausado = await http().patch(ruta).set(OPERADOR).send({ estado: 'PAUSADO' }).expect(200);
    await http().patch(ruta).set(OPERADOR).send({ estado: 'ACTIVO' }).expect(200);
    const ampliado = await http()
      .patch(ruta)
      .set(OPERADOR)
      .send({ cupoTotal: 200, terminaEn: '2099-06-01T00:00:00Z' })
      .expect(200);

    expect(pausado.body).toMatchObject({ estado: 'PAUSADO', vigente: false });
    expect(ampliado.body).toMatchObject({ cupoTotal: 200, terminaEn: '2099-06-01T00:00:00.000Z' });
    expect(contexto.auditoria?.acciones()).toEqual(
      expect.arrayContaining(['cupon.pausado', 'cupon.reactivado', 'cupon.actualizado']),
    );
  });

  it('con canjes rechaza cambiar el tipo o el valor (409 CUPON_CON_CANJES)', async () => {
    const creado = await http().post('/api/cupones').set(OPERADOR).send(aumentoCuota).expect(201);
    await contexto.prisma.cupon.update({ where: { id: creado.body.id }, data: { canjes: 1 } });

    const respuesta = await http()
      .patch(`/api/cupones/${creado.body.id}`)
      .set(OPERADOR)
      .send({ porcentaje: '20' })
      .expect(409);

    expect(respuesta.body.codigo).toBe('CUPON_CON_CANJES');
  });

  it('rechaza reducir el cupo (409 CAMBIO_NO_PERMITIDO)', async () => {
    const creado = await http().post('/api/cupones').set(OPERADOR).send(aumentoCuota).expect(201);

    const respuesta = await http()
      .patch(`/api/cupones/${creado.body.id}`)
      .set(OPERADOR)
      .send({ cupoTotal: 50 })
      .expect(409);

    expect(respuesta.body.codigo).toBe('CAMBIO_NO_PERMITIDO');
  });

  it('un apostador no puede crear, listar, ver ni editar cupones (403)', async () => {
    const creado = await http().post('/api/cupones').set(OPERADOR).send(aumentoCuota).expect(201);

    await http().post('/api/cupones').set(APOSTADOR).send(bonoDeposito).expect(403);
    await http().get('/api/cupones').set(APOSTADOR).expect(403);
    await http().get(`/api/cupones/${creado.body.id}`).set(APOSTADOR).expect(403);
    await http()
      .patch(`/api/cupones/${creado.body.id}`)
      .set(APOSTADOR)
      .send({ estado: 'PAUSADO' })
      .expect(403);
  });

  it('sin sesión responde 401', async () => {
    await http().get('/api/cupones').expect(401);
    await http().post('/api/cupones').send(aumentoCuota).expect(401);
  });
});

describe('API /api/cupones sin la auditoría del Spec 2 (e2e)', () => {
  let contexto: AppDePrueba;

  beforeAll(async () => {
    contexto = await crearAppDePrueba({ conAuditoria: false });
    await limpiarTablasSpec4(contexto.prisma);
  });

  afterAll(async () => {
    await contexto.app.close();
  });

  it('crear un cupón responde 503 DEPENDENCIA_NO_DISPONIBLE y no escribe', async () => {
    const respuesta = await request(contexto.app.getHttpServer())
      .post('/api/cupones')
      .set(OPERADOR)
      .send(aumentoCuota)
      .expect(503);

    expect(respuesta.body.codigo).toBe('DEPENDENCIA_NO_DISPONIBLE');
    expect(await contexto.prisma.cupon.count()).toBe(0);
  });
});
