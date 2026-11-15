import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import { ENTORNO, type Entorno } from '../../src/config/env.js';
import type { MapaEventos } from '../../src/contracts/eventos.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { AuditoriaEnMemoria } from '../dobles/auditoria-en-memoria.js';
import { BilleteraEnMemoria } from '../dobles/billetera-en-memoria.js';
import { DoblesSpec2Module } from '../dobles/dobles-spec2.module.js';
import { GuardDePrueba } from '../dobles/guard-de-prueba.js';
import { AUDITORIA_PORT } from '../../src/contracts/auditoria.port.js';
import { BILLETERA_PORT } from '../../src/contracts/billetera.port.js';
import { AutenticacionGuard } from '../../src/identidad/autenticacion.guard.js';

export interface AppDePrueba {
  readonly app: NestExpressApplication;
  readonly prisma: PrismaService;
  readonly billetera: BilleteraEnMemoria | null;
  readonly auditoria: AuditoriaEnMemoria | null;
  /** Emite un evento de dominio y espera a que terminen sus listeners. */
  emitir<E extends keyof MapaEventos>(evento: E, carga: MapaEventos[E]): Promise<void>;
}

export interface OpcionesAppDePrueba {
  readonly conBilletera?: boolean;
  readonly conAuditoria?: boolean;
}

/** App completa (AppModule + configurarApp) contra PostgreSQL y Redis reales, con los dobles del Spec 2. */
export async function crearAppDePrueba(opciones: OpcionesAppDePrueba = {}): Promise<AppDePrueba> {
  const billetera = (opciones.conBilletera ?? true) ? new BilleteraEnMemoria() : null;
  const auditoria = (opciones.conAuditoria ?? true) ? new AuditoriaEnMemoria() : null;
  const modulo = await Test.createTestingModule({
    imports: [AppModule, DoblesSpec2Module.registrar({ billetera, auditoria })],
  })
    // El Spec 2 ya está integrado: su guard real (que exige un JWT) y sus puertos reales se reemplazan por los
    // dobles de estas pruebas. `null` deja el puerto ausente para probar la falla cerrada (503).
    .overrideProvider(AutenticacionGuard)
    .useClass(GuardDePrueba)
    .overrideProvider(BILLETERA_PORT)
    .useValue(billetera)
    .overrideProvider(AUDITORIA_PORT)
    .useValue(auditoria)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app, app.get<Entorno>(ENTORNO));
  await app.init();
  const emisor = app.get(EventEmitter2);
  return {
    app,
    prisma: app.get(PrismaService),
    billetera,
    auditoria,
    emitir: async (evento, carga) => {
      await emisor.emitAsync(evento, carga);
    },
  };
}

/** Vacía las tablas del Spec 4 (solo en la base de pruebas local o de CI). */
export async function limpiarTablasSpec4(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE alerta_fraude, actividad_usuario, bono, canje_cupon, cupon RESTART IDENTITY CASCADE',
  );
}
