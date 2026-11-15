/**
 * Reloj del servidor (constitución, principio III): vigencias, vencimientos y ventanas se evalúan con él. Se
 * inyecta con `@Optional() @Inject(RELOJ)` para que las pruebas fijen la hora; sin proveedor, es el del sistema.
 */
export interface Reloj {
  ahora(): Date;
}

export const RELOJ = Symbol('RELOJ');

export const relojDelSistema: Reloj = { ahora: () => new Date() };
