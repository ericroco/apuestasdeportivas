import type { ConsumoProveedorDto } from '@apuestas/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENTORNO, type Entorno } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.constants.js';
import { consultasReservadas } from './frecuencia.js';

/** Las claves del día caducan solas; 2 días cubren cualquier desfase de zona horaria. */
const CADUCIDAD_SEGUNDOS = 2 * 24 * 60 * 60;

/**
 * Incrementa el contador solo si no supera el límite, de forma atómica (un script Lua se ejecuta entero).
 * Devuelve el nuevo valor, o -1 si no hay cupo: así nunca se supera el presupuesto, ni con reintentos ni
 * con varios procesos (SC-005).
 */
const SCRIPT_RESERVAR = `
local actual = tonumber(redis.call('GET', KEYS[1]) or '0')
if actual >= tonumber(ARGV[1]) then return -1 end
local nuevo = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return nuevo`;

/** Sube el contador al consumo que informa el proveedor, nunca lo baja. */
const SCRIPT_AJUSTAR = `
local actual = tonumber(redis.call('GET', KEYS[1]) or '0')
local informado = tonumber(ARGV[1])
if informado > actual then
  redis.call('SET', KEYS[1], informado, 'EX', ARGV[2])
  return informado
end
return actual`;

export function fechaUtc(fecha: Date = new Date()): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Presupuesto diario de consultas a API-Football (research.md §2, FR-010). Toda consulta pasa por
 * `reservar()` ANTES de hacerse; si no hay cupo, no se hace. Una copia diaria va a `consumo_proveedor`
 * para el panel del operador.
 */
@Injectable()
export class PresupuestoService {
  private readonly logger = new Logger('PresupuestoProveedor');

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  private get presupuesto(): number {
    return this.entorno.API_FOOTBALL_PRESUPUESTO_DIARIO;
  }

  /**
   * Reserva una consulta. Las normales no tocan el 10 % reservado; las prioritarias (resultado final de los
   * partidos que terminan) sí pueden usarlo.
   */
  async reservar(prioritaria = false): Promise<boolean> {
    const limite = prioritaria
      ? this.presupuesto
      : this.presupuesto - consultasReservadas(this.presupuesto);
    const fecha = fechaUtc();
    const resultado = Number(
      await this.redis.eval(SCRIPT_RESERVAR, 1, clave(fecha), limite, CADUCIDAD_SEGUNDOS),
    );
    if (resultado < 0) {
      await this.avisarAgotado(fecha, prioritaria);
      return false;
    }
    await this.guardarCopia(fecha, resultado);
    return true;
  }

  /** La cabecera del proveedor manda si informa menos consultas restantes que nuestro contador. */
  async ajustarConRestantes(restantesSegunProveedor: number): Promise<void> {
    const consumidas = this.presupuesto - restantesSegunProveedor;
    if (consumidas <= 0) return;
    const fecha = fechaUtc();
    const valor = Number(
      await this.redis.eval(SCRIPT_AJUSTAR, 1, clave(fecha), consumidas, CADUCIDAD_SEGUNDOS),
    );
    await this.guardarCopia(fecha, valor);
  }

  async consumo(fecha: string = fechaUtc()): Promise<ConsumoProveedorDto> {
    const consultas = Number((await this.redis.get(clave(fecha))) ?? 0);
    return {
      fecha,
      consultas,
      limite: this.presupuesto,
      agotado: consultas >= this.presupuesto - consultasReservadas(this.presupuesto),
    };
  }

  private async guardarCopia(fecha: string, consultas: number): Promise<void> {
    const dia = new Date(`${fecha}T00:00:00Z`);
    await this.prisma.consumoProveedor.upsert({
      where: { fecha: dia },
      create: { fecha: dia, consultas, limite: this.presupuesto },
      update: { consultas, limite: this.presupuesto },
    });
  }

  /** Avisa una sola vez por día y tipo de consulta; el panel muestra el estado con `consumo()`. */
  private async avisarAgotado(fecha: string, prioritaria: boolean): Promise<void> {
    const tipo = prioritaria ? 'total' : 'normal';
    const primeraVez = await this.redis.set(
      `api-football:aviso:${fecha}:${tipo}`,
      '1',
      'EX',
      CADUCIDAD_SEGUNDOS,
      'NX',
    );
    if (primeraVez) {
      this.logger.warn(
        `Presupuesto de API-Football agotado (${tipo}) para ${fecha}: no se consultará hasta mañana. ` +
          'El operador puede cargar resultados a mano.',
      );
    }
  }
}

function clave(fecha: string): string {
  return `api-football:consumo:${fecha}`;
}
