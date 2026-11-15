import { aTexto } from '../../comun/montos.js';
import type { EntradaActividad } from '../actividad.mapeo.js';
import type { ContextoReglas } from './contexto.js';

/** Apuesta con monto mayor que el promedio de sus apuestas previas por el factor (FR-019): alerta MEDIA. */
export async function evaluarMontoAnomalo(
  contexto: ContextoReglas,
  entrada: EntradaActividad,
): Promise<void> {
  const { monto, usuarioId, referenciaId: apuestaId } = entrada;
  if (!monto) return;
  const { FRAUDE_APUESTA_FACTOR: factor, FRAUDE_APUESTA_HISTORIAL_MIN: minimo } = contexto.entorno;
  const previas = await contexto.prisma.actividadUsuario.aggregate({
    where: { usuarioId, tipo: 'APUESTA_ACEPTADA', referenciaId: { not: apuestaId } },
    _avg: { monto: true },
    _count: { _all: true },
  });
  const promedio = previas._avg.monto;
  if (!promedio || previas._count._all < minimo) return;
  if (!monto.gt(promedio.mul(factor))) return;
  await contexto.alertas.registrar({
    regla: 'APUESTA_MONTO_ANOMALO',
    severidad: 'MEDIA',
    usuarioId,
    evidencia: {
      apuestaId,
      monto: aTexto(monto),
      promedioPrevio: aTexto(promedio),
      factor,
      apuestasPrevias: previas._count._all,
    },
    claveDeduplicacion: `monto:${apuestaId}`,
  });
}

/** Más apuestas que el máximo en la ventana (FR-020): una sola alerta MEDIA por ventana. */
export async function evaluarRafaga(
  contexto: ContextoReglas,
  entrada: EntradaActividad,
): Promise<void> {
  const { usuarioId } = entrada;
  const { FRAUDE_RAFAGA_MAX_APUESTAS: maximo, FRAUDE_RAFAGA_VENTANA_SEG: ventana } =
    contexto.entorno;
  const ahoraMs = contexto.ahora.getTime();
  const apuestas = await contexto.prisma.actividadUsuario.count({
    where: {
      usuarioId,
      tipo: 'APUESTA_ACEPTADA',
      ocurridoEn: { gte: new Date(ahoraMs - ventana * 1000) },
    },
  });
  if (apuestas <= maximo) return;
  const indiceVentana = Math.floor(ahoraMs / 1000 / ventana);
  await contexto.alertas.registrar({
    regla: 'RAFAGA_APUESTAS',
    severidad: 'MEDIA',
    usuarioId,
    evidencia: {
      apuestas,
      maximo,
      ventanaSegundos: ventana,
      ultimaApuestaId: entrada.referenciaId,
    },
    claveDeduplicacion: `rafaga:${usuarioId}:${indiceVentana}`,
  });
}
