import type { ResumenReporte } from '@/lib/servidor/esquemas-reportes';

/**
 * Un periodo sin actividad: reportes responde ceros y la pantalla lo dice con palabras ("sin datos en
 * este periodo") en lugar de dejar al administrador interpretando una fila de ceros.
 */
export function esPeriodoVacio({
  apuestas,
  depositos,
  retiros,
  cupones,
  alertas,
}: ResumenReporte): boolean {
  return [
    apuestas.cantidad,
    depositos.cantidad,
    retiros.cantidad,
    cupones.canjesAceptados,
    cupones.canjesRechazados,
    alertas.abiertas,
    alertas.confirmadas,
    alertas.descartadas,
  ].every((cantidad) => cantidad === 0);
}

/** El GGR llega con signo: negativo significa que los premios superaron lo apostado que se liquidó. */
export function esNegativo(texto: string): boolean {
  return texto.trim().startsWith('-');
}
