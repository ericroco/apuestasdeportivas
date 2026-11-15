import { CERO, aTexto, type Decimal } from '../../comun/montos.js';
import { MS_POR_HORA, type ContextoReglas } from './contexto.js';

/**
 * Retiro tras un depósito sin jugar (FR-021). Toma el depósito confirmado más reciente de la ventana y suma lo
 * apostado (apuestas aceptadas registradas) desde ese depósito. Si es menor que el porcentaje mínimo del depósito,
 * crea la alerta ALTA (una vez por depósito) y devuelve `true`.
 */
export async function evaluarRetiroTrasDeposito(
  contexto: ContextoReglas,
  usuarioId: string,
  montoRetiro: Decimal,
): Promise<boolean> {
  const {
    FRAUDE_RETIRO_VENTANA_HORAS: ventanaHoras,
    FRAUDE_RETIRO_ACTIVIDAD_MIN_PCT: minimoPorcentaje,
  } = contexto.entorno;
  const desde = new Date(contexto.ahora.getTime() - ventanaHoras * MS_POR_HORA);
  const deposito = await contexto.prisma.actividadUsuario.findFirst({
    where: { usuarioId, tipo: 'DEPOSITO', ocurridoEn: { gte: desde } },
    orderBy: [{ ocurridoEn: 'desc' }, { id: 'desc' }],
    select: { referenciaId: true, monto: true, ocurridoEn: true },
  });
  if (!deposito?.monto) return false;
  const suma = await contexto.prisma.actividadUsuario.aggregate({
    where: { usuarioId, tipo: 'APUESTA_ACEPTADA', ocurridoEn: { gte: deposito.ocurridoEn } },
    _sum: { monto: true },
  });
  const apostado = suma._sum.monto ?? CERO;
  if (!apostado.lt(deposito.monto.mul(minimoPorcentaje).div(100))) return false;
  await contexto.alertas.registrar({
    regla: 'RETIRO_TRAS_DEPOSITO',
    severidad: 'ALTA',
    usuarioId,
    evidencia: {
      depositoId: deposito.referenciaId,
      deposito: aTexto(deposito.monto),
      apostado: aTexto(apostado),
      minimoPorcentaje,
      retiro: aTexto(montoRetiro),
      ventanaHoras,
    },
    claveDeduplicacion: `retiro:${usuarioId}:${deposito.referenciaId}`,
  });
  return true;
}
