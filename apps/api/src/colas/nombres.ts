/** Colas BullMQ del Spec 3 (research.md §1). */
export const COLAS = {
  /** Importación desde el proveedor y vencimiento de plazos de suspensión. Concurrencia 1: único worker. */
  sincronizacion: 'sincronizacion',
  /** Un trabajo con retardo por cada apuesta en vivo. */
  apuestasVivo: 'apuestas-vivo',
  /** Un trabajo por partido y versión de resultado. */
  liquidacion: 'liquidacion',
} as const;

export type NombreCola = (typeof COLAS)[keyof typeof COLAS];
