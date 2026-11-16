import { Injectable } from '@nestjs/common';
import type { Entorno } from '../config/env.js';
import { mapearCuotas, mapearPartido, type RespuestaApiFootball } from './api-football.mapeo.js';
import { PresupuestoService } from './presupuesto.service.js';
import {
  type CuotasPartidoProveedor,
  type PartidoProveedor,
  PresupuestoAgotadoError,
  type ProveedorDeportivo,
  ProveedorNoDisponibleError,
} from './proveedor-deportivo.port.js';

const TIMEOUT_MS = 10_000;

/**
 * Cliente HTTP de API-Football v3 (research.md §2 y §10). Único lugar del sistema que conoce la clave:
 * nunca la registra en el log ni la incluye en los errores, y el navegador nunca llama al proveedor (FR-009).
 * Cada consulta reserva cupo del presupuesto antes de hacerse.
 *
 * Plan gratuito (verificado en T029, research.md §2): por liga y temporada solo da acceso a 2022-2024 y no admite
 * `ids=`. Por eso todo se consulta sin temporada: por fecha, `live=all`, `id=` y `odds?fixture=`.
 */
@Injectable()
export class ApiFootballProveedor implements ProveedorDeportivo {
  readonly esSimulacion = false;
  private readonly ligas: ReadonlySet<number>;

  constructor(
    private readonly entorno: Entorno,
    private readonly presupuesto: PresupuestoService,
  ) {
    this.ligas = new Set(entorno.API_FOOTBALL_LIGAS);
  }

  async partidosDelDia(fecha: string): Promise<PartidoProveedor[]> {
    // Una consulta trae todas las ligas del día; se filtran las configuradas.
    const datos = await this.consultar('/fixtures', { date: fecha });
    return this.partidosDeLigas(datos);
  }

  async partidosEnVivo(): Promise<PartidoProveedor[]> {
    // `live=<liga>` con una sola liga no pasa la validación del proveedor; `all` sí, y se filtra aquí.
    const datos = await this.consultar('/fixtures', { live: 'all' });
    return this.partidosDeLigas(datos);
  }

  async partidosPorId(ids: readonly number[]): Promise<PartidoProveedor[]> {
    // Una consulta por partido: el plan gratuito no admite `ids=`. Son pocos (los que acaban de terminar).
    const partidos: PartidoProveedor[] = [];
    for (const id of ids) {
      const datos = await this.consultar('/fixtures', { id: String(id) }, true);
      partidos.push(...this.partidosDeLigas(datos));
    }
    return partidos;
  }

  async cuotasDePartido(idProveedorPartido: number): Promise<CuotasPartidoProveedor | null> {
    // Por partido y no por fecha: `odds?date=` trae todas las ligas en decenas de páginas de 10.
    const [dato] = await this.consultar('/odds', { fixture: String(idProveedorPartido) });
    return dato === undefined ? null : mapearCuotas(dato);
  }

  private partidosDeLigas(datos: unknown[]): PartidoProveedor[] {
    return datos
      .map(mapearPartido)
      .filter(
        (p): p is PartidoProveedor => p !== null && this.ligas.has(p.competicion.idProveedor),
      );
  }

  private async consultar(
    ruta: string,
    parametros: Record<string, string>,
    prioritaria = false,
  ): Promise<unknown[]> {
    if (!(await this.presupuesto.reservar(prioritaria))) {
      throw new PresupuestoAgotadoError(`Sin cupo para consultar ${ruta}`);
    }
    const url = new URL(ruta, this.entorno.API_FOOTBALL_BASE_URL);
    for (const [nombre, valor] of Object.entries(parametros)) url.searchParams.set(nombre, valor);

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        headers: { 'x-apisports-key': this.entorno.API_FOOTBALL_KEY ?? '' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const causa = error instanceof Error ? error.name : 'desconocida';
      throw new ProveedorNoDisponibleError(`API-Football no respondió a ${ruta} (${causa})`);
    }
    await this.ajustarPresupuesto(respuesta);
    if (!respuesta.ok) {
      throw new ProveedorNoDisponibleError(`API-Football respondió ${respuesta.status} a ${ruta}`);
    }
    const cuerpo = (await respuesta.json()) as RespuestaApiFootball<unknown>;
    if (tieneErrores(cuerpo.errors)) {
      throw new ProveedorNoDisponibleError(`API-Football informó errores en ${ruta}`);
    }
    return Array.isArray(cuerpo.response) ? cuerpo.response : [];
  }

  private async ajustarPresupuesto(respuesta: Response): Promise<void> {
    // Sin la cabecera no se ajusta nada: Number(null) sería 0 y daría el presupuesto por agotado.
    const cabecera = respuesta.headers.get('x-ratelimit-requests-remaining');
    if (cabecera === null || cabecera.trim() === '') return;
    const restantes = Number(cabecera);
    if (Number.isInteger(restantes) && restantes >= 0) {
      await this.presupuesto.ajustarConRestantes(restantes);
    }
  }
}

/** API-Football devuelve `errors` como `[]` o como objeto `{ campo: mensaje }`. */
function tieneErrores(errores: unknown): boolean {
  if (Array.isArray(errores)) return errores.length > 0;
  return typeof errores === 'object' && errores !== null && Object.keys(errores).length > 0;
}
