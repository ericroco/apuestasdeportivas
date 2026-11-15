/**
 * Token del cliente Redis compartido, solo para COMANDOS: caché, contadores, locks y `publish`.
 * - Para suscribirse (pub/sub) usa una conexión dedicada: `redis.duplicate()`. Un cliente suscrito ya no
 *   puede ejecutar otros comandos.
 * - BullMQ (Spec 3) abre sus propias conexiones con REDIS_URL y exige `maxRetriesPerRequest: null`;
 *   no le pases este cliente, que usa `maxRetriesPerRequest: 1` para fallar rápido en la salud.
 */
export const REDIS = Symbol('REDIS');
