import { z } from 'zod';
import { textoDecimal, type Decimal } from '../comun/montos.js';
import type {
  ApuestaLiquidada,
  RetiroSolicitado,
  UsuarioRegistrado,
} from '../contracts/eventos.js';
import type { TipoActividad } from '../generated/prisma/client.js';
import type {
  ApuestaAceptadaExtendida,
  DepositoConfirmadoExtendido,
} from './eventos-extendidos.js';

/** Una fila de `actividad_usuario` sin `id` ni `ocurridoEn` (los pone la base y el reloj del servidor). */
export interface EntradaActividad {
  readonly usuarioId: string;
  readonly tipo: TipoActividad;
  readonly referenciaId: string;
  readonly monto?: Decimal | null;
  readonly cuota?: Decimal | null;
  readonly tipoSaldo?: string | null;
  readonly resultado?: string | null;
  readonly ip?: string | null;
  readonly dispositivo?: string | null;
  readonly metodoPagoHuella?: string | null;
}

/** El evento no cumple su contrato. El mensaje nombra los campos, nunca sus valores. */
export class EventoInvalidoError extends Error {
  override readonly name = 'EventoInvalidoError';

  constructor(evento: string, campos: readonly string[]) {
    super(`Evento ${evento} inválido en: ${campos.join(', ') || '(raíz)'}`);
  }
}

const identificador = z.string().min(1).max(100);
/** Texto libre opcional del cliente (IP, dispositivo): recortado y vacío → nulo. */
const textoDeCliente = (maximo: number) =>
  z.string().transform((valor) => valor.trim().slice(0, maximo) || null);
/** Campos propuestos en cambios-contratos.md: si faltan o no son válidos, cuentan como ausentes. */
const opcionalTolerante = <T extends z.ZodType>(esquema: T) => esquema.nullish().catch(null);

const esquemas = {
  'usuario.registrado': z.object({
    usuarioId: identificador,
    ip: textoDeCliente(100),
    dispositivo: textoDeCliente(500),
  }),
  'deposito.confirmado': z.object({
    usuarioId: identificador,
    depositoId: identificador,
    monto: textoDecimal,
    metodoPagoHuella: opcionalTolerante(z.string().min(1).max(128)),
  }),
  'retiro.solicitado': z.object({
    usuarioId: identificador,
    retiroId: identificador,
    monto: textoDecimal,
  }),
  'apuesta.aceptada': z.object({
    usuarioId: identificador,
    apuestaId: identificador,
    monto: textoDecimal,
    tipoSaldo: z.enum(['REAL', 'BONO']),
    cuotaTotal: opcionalTolerante(textoDecimal),
  }),
  'apuesta.liquidada': z.object({
    usuarioId: identificador,
    apuestaId: identificador,
    resultado: z.enum(['GANADA', 'PERDIDA', 'ANULADA']),
    monto: textoDecimal,
  }),
};

function validar<E extends keyof typeof esquemas>(
  evento: E,
  carga: unknown,
): z.output<(typeof esquemas)[E]> {
  const resultado = esquemas[evento].safeParse(carga);
  if (!resultado.success) {
    throw new EventoInvalidoError(
      evento,
      resultado.error.issues.map((problema) => problema.path.join('.')),
    );
  }
  return resultado.data as z.output<(typeof esquemas)[E]>;
}

export function desdeUsuarioRegistrado(evento: UsuarioRegistrado): EntradaActividad {
  const { usuarioId, ip, dispositivo } = validar('usuario.registrado', evento);
  return { usuarioId, tipo: 'REGISTRO', referenciaId: usuarioId, ip, dispositivo };
}

export function desdeDepositoConfirmado(evento: DepositoConfirmadoExtendido): EntradaActividad {
  const datos = validar('deposito.confirmado', evento);
  return {
    usuarioId: datos.usuarioId,
    tipo: 'DEPOSITO',
    referenciaId: datos.depositoId,
    monto: datos.monto,
    metodoPagoHuella: datos.metodoPagoHuella ?? null,
  };
}

export function desdeRetiroSolicitado(evento: RetiroSolicitado): EntradaActividad {
  const datos = validar('retiro.solicitado', evento);
  return {
    usuarioId: datos.usuarioId,
    tipo: 'RETIRO',
    referenciaId: datos.retiroId,
    monto: datos.monto,
  };
}

export function desdeApuestaAceptada(evento: ApuestaAceptadaExtendida): EntradaActividad {
  const datos = validar('apuesta.aceptada', evento);
  return {
    usuarioId: datos.usuarioId,
    tipo: 'APUESTA_ACEPTADA',
    referenciaId: datos.apuestaId,
    monto: datos.monto,
    tipoSaldo: datos.tipoSaldo,
    cuota: datos.cuotaTotal ?? null,
  };
}

export function desdeApuestaLiquidada(evento: ApuestaLiquidada): EntradaActividad {
  const datos = validar('apuesta.liquidada', evento);
  return {
    usuarioId: datos.usuarioId,
    tipo: 'APUESTA_LIQUIDADA',
    referenciaId: datos.apuestaId,
    monto: datos.monto,
    resultado: datos.resultado,
  };
}
