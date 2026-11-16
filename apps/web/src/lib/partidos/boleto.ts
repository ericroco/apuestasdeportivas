/**
 * Estado del boleto en el navegador (research.md §13): selecciones elegidas y sus cuotas vistas. Todo lo que se
 * muestra aquí es informativo: la cuota y la ganancia que cuentan las calcula y congela la API al aceptar.
 */

export interface SeleccionBoleto {
  readonly seleccionId: string;
  readonly partidoId: string;
  readonly partido: string;
  readonly mercado: string;
  readonly nombre: string;
  /** Cuota tal como se vio, en texto decimal ("2.10"). */
  readonly cuota: string;
}

export type AccionBoleto =
  | { readonly tipo: 'alternar'; readonly seleccion: SeleccionBoleto }
  | { readonly tipo: 'quitar'; readonly seleccionId: string }
  | { readonly tipo: 'actualizar-cuotas'; readonly cuotas: ReadonlyMap<string, string> }
  | { readonly tipo: 'vaciar' };

/**
 * Agrega o quita una selección. Una segunda selección del mismo partido reemplaza a la anterior: la API rechaza
 * combinar dos del mismo partido (COMBINADA_INVALIDA), así que el boleto no lo permite.
 */
export function reducirBoleto(
  selecciones: readonly SeleccionBoleto[],
  accion: AccionBoleto,
): SeleccionBoleto[] {
  switch (accion.tipo) {
    case 'alternar': {
      const { seleccion } = accion;
      if (selecciones.some((s) => s.seleccionId === seleccion.seleccionId)) {
        return selecciones.filter((s) => s.seleccionId !== seleccion.seleccionId);
      }
      return [...selecciones.filter((s) => s.partidoId !== seleccion.partidoId), seleccion];
    }
    case 'quitar':
      return selecciones.filter((s) => s.seleccionId !== accion.seleccionId);
    case 'actualizar-cuotas':
      return selecciones.map((s) => {
        const cuota = accion.cuotas.get(s.seleccionId);
        return cuota ? { ...s, cuota } : s;
      });
    case 'vaciar':
      return [];
  }
}

/** Monto con hasta dos decimales y mayor que cero; los límites los aplica la API e informa cuál se superó. */
export function montoValido(texto: string): boolean {
  return /^\d{1,7}(\.\d{1,2})?$/.test(texto) && Number(texto) > 0;
}

const CIEN = BigInt(100);

/** Centésimos enteros de un texto decimal: evita los errores de coma flotante al estimar. */
function aCentesimos(texto: string): bigint {
  const [entero = '0', decimales = ''] = texto.split('.');
  return BigInt(entero) * CIEN + BigInt(decimales.padEnd(2, '0').slice(0, 2) || '0');
}

function aTexto(centesimos: bigint): string {
  return `${centesimos / CIEN}.${String(centesimos % CIEN).padStart(2, '0')}`;
}

/** Multiplica dos cantidades en centésimos y redondea mitad hacia arriba, como la API (ROUND_HALF_UP). */
function multiplicar(a: bigint, b: bigint): bigint {
  return (a * b + BigInt(50)) / CIEN;
}

/**
 * Cuota total y ganancia estimadas, solo para mostrar antes de confirmar: producto de las cuotas redondeado una
 * vez (como la API) y monto × cuota. `null` si el monto no es válido o el boleto está vacío.
 */
export function estimar(
  selecciones: readonly SeleccionBoleto[],
  monto: string,
): { cuotaTotal: string; ganancia: string } | null {
  if (selecciones.length === 0) return null;
  // El producto exacto con todos los decimales, y un solo redondeo al final.
  let numerador = BigInt(1);
  let escala = BigInt(1);
  for (const s of selecciones) {
    numerador *= aCentesimos(s.cuota);
    escala *= CIEN;
  }
  const cuotaTotal = (numerador * CIEN * BigInt(2) + escala) / (escala * BigInt(2));
  if (!montoValido(monto)) return { cuotaTotal: aTexto(cuotaTotal), ganancia: '' };
  return {
    cuotaTotal: aTexto(cuotaTotal),
    ganancia: aTexto(multiplicar(aCentesimos(monto), cuotaTotal)),
  };
}
