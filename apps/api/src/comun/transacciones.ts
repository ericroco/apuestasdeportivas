/** Espera máxima por una conexión del pool y duración máxima de una transacción de canje, bono o rollover (ms). */
const MS_TRANSACCION = 10_000;

/** Opciones explícitas de `$transaction` para no depender de los valores por defecto de Prisma (2 s y 5 s). */
export const OPCIONES_TRANSACCION = { maxWait: MS_TRANSACCION, timeout: MS_TRANSACCION } as const;
