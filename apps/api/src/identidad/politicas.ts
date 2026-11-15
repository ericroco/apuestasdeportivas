import { CONTRASENAS_COMUNES } from './contrasenas-comunes.js';

/** Reglas de identidad puras (FR-002, FR-003). Usan el reloj del servidor que les pasa quien llama. */

export const EDAD_MINIMA = 18;
export const LARGO_MINIMO_CONTRASENA = 12;
export const LARGO_MAXIMO_CONTRASENA = 128;

/** Correo en la forma en que se guarda: minúsculas y sin espacios alrededor (check de la tabla `usuario`). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Edad cumplida en años en la fecha `hoy` (UTC). Quien cumple 18 hoy ya es mayor de edad. */
export function edadEn(fechaNacimiento: Date, hoy: Date): number {
  let edad = hoy.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const mes = hoy.getUTCMonth() - fechaNacimiento.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoy.getUTCDate() < fechaNacimiento.getUTCDate())) edad -= 1;
  return edad;
}

export function esMayorDeEdad(fechaNacimiento: Date, hoy: Date): boolean {
  return edadEn(fechaNacimiento, hoy) >= EDAD_MINIMA;
}

/**
 * Devuelve el motivo por el que la contraseña no sirve, o `null` si sirve. Los mensajes explican qué cambiar
 * (principio VII) y nunca repiten la contraseña.
 */
export function motivoContrasenaInvalida(contrasena: string, email: string): string | null {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;
  }
  if (contrasena.length > LARGO_MAXIMO_CONTRASENA) {
    return `La contraseña puede tener como máximo ${LARGO_MAXIMO_CONTRASENA} caracteres.`;
  }
  const minusculas = contrasena.toLowerCase();
  if (CONTRASENAS_COMUNES.has(minusculas) || /^(.)\1+$/.test(contrasena)) {
    return 'Esa contraseña es muy común. Elige otra más difícil de adivinar.';
  }
  const usuarioCorreo = normalizarEmail(email).split('@')[0] ?? '';
  if (usuarioCorreo.length >= 4 && minusculas.includes(usuarioCorreo)) {
    return 'La contraseña no puede contener tu correo.';
  }
  return null;
}
