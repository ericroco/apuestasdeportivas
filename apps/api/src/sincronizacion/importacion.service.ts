import type { EstadoPartido } from '@apuestas/shared';
import { Injectable, Logger } from '@nestjs/common';
import { contextoSistema } from '../comun/contexto-operacion.js';
import { Decimal } from '../comun/decimal.js';
import { rutaDeEstados } from '../partidos/maquina-estados.js';
import { MercadosService } from '../partidos/mercados.service.js';
import { type ActualizacionPartido, PartidosService } from '../partidos/partidos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CuotasPartidoProveedor,
  MercadoProveedor,
  PartidoProveedor,
} from './proveedor-deportivo.port.js';

export interface ResumenImportacion {
  readonly creados: number;
  readonly actualizados: number;
  readonly omitidos: number;
}

const CONTEXTO = contextoSistema('PROVEEDOR');
const ESTADOS_CON_MARCADOR: readonly EstadoPartido[] = ['EN_VIVO', 'FINALIZADO'];

/**
 * Lleva los datos del proveedor al sistema de forma idempotente (FR-012): importar lo mismo dos veces no
 * duplica partidos ni mercados. Los cambios de estado y marcador pasan por PartidosService.aplicarActualizacion,
 * el mismo camino que usan el operador y la simulación. Un elemento que falla se omite y se registra;
 * no detiene al resto.
 */
@Injectable()
export class ImportacionService {
  private readonly logger = new Logger('Importacion');

  constructor(
    private readonly prisma: PrismaService,
    private readonly partidos: PartidosService,
    private readonly mercados: MercadosService,
  ) {}

  async importarPartidos(lista: readonly PartidoProveedor[]): Promise<ResumenImportacion> {
    let creados = 0;
    let actualizados = 0;
    let omitidos = 0;
    for (const dato of lista) {
      try {
        if (await this.importarPartido(dato)) creados += 1;
        else actualizados += 1;
      } catch (error) {
        omitidos += 1;
        this.logger.warn(`Partido ${dato.idProveedor} omitido: ${mensaje(error)}`);
      }
    }
    return { creados, actualizados, omitidos };
  }

  async importarCuotas(lista: readonly CuotasPartidoProveedor[]): Promise<number> {
    let mercadosTocados = 0;
    for (const { idProveedorPartido, mercados } of lista) {
      const partido = await this.prisma.partido.findUnique({
        where: { idProveedor: idProveedorPartido },
      });
      // Solo cuotas pre-partido (research.md §2); las de vivo las fija el operador.
      if (partido?.estado !== 'PROGRAMADO') continue;
      for (const mercado of mercados) {
        try {
          if (await this.importarMercado(partido.id, mercado)) mercadosTocados += 1;
        } catch (error) {
          this.logger.warn(
            `Mercado ${mercado.tipo} de ${idProveedorPartido} omitido: ${mensaje(error)}`,
          );
        }
      }
    }
    return mercadosTocados;
  }

  /** Devuelve `true` si el partido es nuevo. */
  private async importarPartido(dato: PartidoProveedor): Promise<boolean> {
    const { competicion } = dato;
    const { id: competicionId } = await this.prisma.competicion.upsert({
      where: { idProveedor: competicion.idProveedor },
      create: {
        idProveedor: competicion.idProveedor,
        nombre: competicion.nombre,
        pais: competicion.pais,
      },
      update: {},
    });
    const existente = await this.prisma.partido.findUnique({
      where: { idProveedor: dato.idProveedor },
    });
    if (!existente) {
      await this.crearPartido(dato, competicionId);
      return true;
    }
    await this.actualizarHora(existente, dato);
    await this.aplicarCambios(existente.id, existente.estado, dato);
    return false;
  }

  private async crearPartido(dato: PartidoProveedor, competicionId: string): Promise<void> {
    const conMarcador = ESTADOS_CON_MARCADOR.includes(dato.estado);
    await this.prisma.partido.create({
      data: {
        competicionId,
        idProveedor: dato.idProveedor,
        nombreLocal: dato.nombreLocal,
        nombreVisitante: dato.nombreVisitante,
        inicioEn: dato.inicioEn,
        inicioOriginalEn: dato.inicioEn,
        estado: dato.estado,
        golesLocal: conMarcador ? dato.golesLocal : null,
        golesVisitante: conMarcador ? dato.golesVisitante : null,
        minuto: dato.minuto,
        origen: 'PROVEEDOR',
      },
    });
  }

  /** Un partido programado que cambia de fecha se actualiza; nunca se borra (edge case de la spec). */
  private async actualizarHora(
    existente: { id: string; estado: EstadoPartido; inicioEn: Date },
    dato: PartidoProveedor,
  ): Promise<void> {
    const cambio = dato.inicioEn.getTime() !== existente.inicioEn.getTime();
    if (existente.estado !== 'PROGRAMADO' || dato.estado !== 'PROGRAMADO' || !cambio) return;
    if (dato.inicioEn.getTime() <= Date.now()) return;
    await this.prisma.partido.update({
      where: { id: existente.id },
      data: { inicioEn: dato.inicioEn, inicioOriginalEn: dato.inicioEn, version: { increment: 1 } },
    });
  }

  /** Recorre la máquina de estados paso a paso aunque el proveedor se haya saltado estados. */
  private async aplicarCambios(
    id: string,
    actual: EstadoPartido,
    dato: PartidoProveedor,
  ): Promise<void> {
    const ruta = rutaDeEstados(actual, dato.estado);
    if (ruta === null) {
      throw new Error(`no hay transición de ${actual} a ${dato.estado}`);
    }
    const marcador = this.marcadorDe(dato);
    if (ruta.length === 0) {
      if (marcador && ESTADOS_CON_MARCADOR.includes(actual) && actual !== 'FINALIZADO') {
        await this.partidos.aplicarActualizacion(
          id,
          { ...marcador, motivo: 'proveedor' },
          CONTEXTO,
        );
      }
      return;
    }
    // El marcador viaja en el último paso que lo admite (en vivo o finalizado).
    const pasoConMarcador = ruta.findLastIndex((paso) => ESTADOS_CON_MARCADOR.includes(paso));
    for (const [indice, estado] of ruta.entries()) {
      const cambio: ActualizacionPartido = {
        estado,
        inicioEn: dato.inicioEn,
        motivo: 'proveedor',
        ...(indice === pasoConMarcador && marcador ? marcador : {}),
      };
      await this.partidos.aplicarActualizacion(id, cambio, CONTEXTO);
    }
  }

  private marcadorDe(dato: PartidoProveedor): ActualizacionPartido | null {
    if (dato.golesLocal === null || dato.golesVisitante === null) return null;
    return {
      golesLocal: dato.golesLocal,
      golesVisitante: dato.golesVisitante,
      minuto: dato.minuto,
    };
  }

  /** Crea el mercado o actualiza sus cuotas, salvo que lo gestione el operador (FR-006). */
  private async importarMercado(partidoId: string, mercado: MercadoProveedor): Promise<boolean> {
    const existente = await this.prisma.mercado.findFirst({
      where: { partidoId, tipo: mercado.tipo, linea: mercado.linea },
      include: { selecciones: true },
    });
    if (!existente) {
      await this.mercados.crearMercado(
        partidoId,
        {
          tipo: mercado.tipo,
          linea: mercado.linea ?? undefined,
          admiteVivo: false,
          selecciones: [...mercado.selecciones],
        },
        CONTEXTO,
      );
      return true;
    }
    if (existente.gestionadoPorOperador || existente.estado === 'CERRADO') return false;

    let cambio = false;
    for (const { codigo, cuota } of mercado.selecciones) {
      const seleccion = existente.selecciones.find((s) => s.codigo === codigo);
      if (seleccion && !seleccion.cuota.equals(new Decimal(cuota))) {
        await this.mercados.cambiarCuota(seleccion.id, new Decimal(cuota), CONTEXTO);
        cambio = true;
      }
    }
    return cambio;
  }
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
