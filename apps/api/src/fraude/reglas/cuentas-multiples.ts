import type { EntradaActividad } from '../actividad.mapeo.js';
import { MS_POR_HORA, type ContextoReglas } from './contexto.js';

/** Caracteres de la huella que se muestran en la evidencia (nunca el identificador del medio de pago). */
const LARGO_HUELLA_VISIBLE = 12;

/** Otra cuenta registró el mismo dispositivo (FR-018): alerta ALTA. */
export async function evaluarCuentasPorDispositivo(
  contexto: ContextoReglas,
  entrada: EntradaActividad,
): Promise<void> {
  const { dispositivo, usuarioId } = entrada;
  if (!dispositivo) return;
  const relacionadas = await contexto.actividad.cuentasRelacionadas(usuarioId, {});
  if (relacionadas.porDispositivo.length === 0) return;
  await contexto.alertas.registrar({
    regla: 'CUENTAS_DISPOSITIVO',
    severidad: 'ALTA',
    usuarioId,
    evidencia: { dispositivo, cuentas: [usuarioId, ...relacionadas.porDispositivo] },
    claveDeduplicacion: `dispositivo:${usuarioId}:${dispositivo}`,
  });
}

/** La IP registra MÁS cuentas que el umbral dentro de la ventana (FR-018): alerta MEDIA. */
export async function evaluarCuentasPorIp(
  contexto: ContextoReglas,
  entrada: EntradaActividad,
): Promise<void> {
  const { ip, usuarioId } = entrada;
  if (!ip) return;
  const { FRAUDE_IP_MAX_CUENTAS: umbral, FRAUDE_IP_VENTANA_HORAS: ventanaHoras } = contexto.entorno;
  const desde = new Date(contexto.ahora.getTime() - ventanaHoras * MS_POR_HORA);
  const registros = await contexto.prisma.actividadUsuario.findMany({
    where: { tipo: 'REGISTRO', ip, ocurridoEn: { gte: desde } },
    select: { usuarioId: true },
    distinct: ['usuarioId'],
    orderBy: { usuarioId: 'asc' },
  });
  if (registros.length <= umbral) return;
  await contexto.alertas.registrar({
    regla: 'CUENTAS_IP',
    severidad: 'MEDIA',
    usuarioId,
    evidencia: { ip, cuentas: registros.map((fila) => fila.usuarioId), umbral, ventanaHoras },
    claveDeduplicacion: `ip:${usuarioId}:${ip}`,
  });
}

/** Otra cuenta depositó con el mismo método de pago (FR-018): alerta ALTA; exige la huella en el evento. */
export async function evaluarMetodoPagoCompartido(
  contexto: ContextoReglas,
  entrada: EntradaActividad,
): Promise<void> {
  const { metodoPagoHuella, usuarioId } = entrada;
  if (!metodoPagoHuella) return;
  const relacionadas = await contexto.actividad.cuentasRelacionadas(usuarioId, {
    metodoPagoHuella,
  });
  if (relacionadas.porMetodoPago.length === 0) return;
  await contexto.alertas.registrar({
    regla: 'METODO_PAGO_COMPARTIDO',
    severidad: 'ALTA',
    usuarioId,
    evidencia: {
      metodoPago: metodoPagoHuella.slice(0, LARGO_HUELLA_VISIBLE),
      cuentas: [usuarioId, ...relacionadas.porMetodoPago],
      depositoId: entrada.referenciaId,
    },
    claveDeduplicacion: `metodo:${usuarioId}:${metodoPagoHuella}`,
  });
}
