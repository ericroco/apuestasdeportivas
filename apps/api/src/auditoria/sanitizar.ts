/**
 * Quita de los datos de un evento de auditoría todo lo que parezca un secreto (FR-031, contrato 3): contraseñas,
 * tokens, secretos y códigos 2FA, datos de tarjeta, cookies y cabeceras de autorización. La clave se conserva con
 * el valor `[omitido]` para que quede constancia de que existía.
 */
const CLAVE_SENSIBLE =
  /contrase|password|^clave$|token|secret|codigo|otp|tarjeta|card|cvv|cvc|^pan$|authorization|cookie|hash/i;

const PROFUNDIDAD_MAXIMA = 6;
export const VALOR_OMITIDO = '[omitido]';

export function sanitizarDatos(
  datos: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (datos === undefined) return undefined;
  return sanitizarValor(datos, 0) as Record<string, unknown>;
}

function sanitizarValor(valor: unknown, profundidad: number): unknown {
  if (profundidad > PROFUNDIDAD_MAXIMA) return VALOR_OMITIDO;
  if (Array.isArray(valor)) return valor.map((item) => sanitizarValor(item, profundidad + 1));
  if (valor instanceof Date) return valor.toISOString();
  if (valor !== null && typeof valor === 'object') {
    // Decimal de Prisma y similares: se guardan como texto, no como objeto interno.
    if (typeof (valor as { toFixed?: unknown }).toFixed === 'function' && 'd' in valor) {
      return String(valor);
    }
    return Object.fromEntries(
      Object.entries(valor).map(([clave, interno]) => [
        clave,
        CLAVE_SENSIBLE.test(clave) ? VALOR_OMITIDO : sanitizarValor(interno, profundidad + 1),
      ]),
    );
  }
  if (typeof valor === 'bigint') return valor.toString();
  return valor;
}
