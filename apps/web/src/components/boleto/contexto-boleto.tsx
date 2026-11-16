'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
} from 'react';
import { type AccionBoleto, reducirBoleto, type SeleccionBoleto } from '@/lib/partidos/boleto';

const CLAVE_ALMACEN = 'apuestas:boleto';

interface Boleto {
  readonly selecciones: readonly SeleccionBoleto[];
  readonly despachar: Dispatch<AccionBoleto>;
}

const ContextoBoleto = createContext<Boleto | null>(null);

function leerGuardado(): SeleccionBoleto[] {
  if (typeof window === 'undefined') return [];
  try {
    const guardado = window.sessionStorage.getItem(CLAVE_ALMACEN);
    return guardado ? (JSON.parse(guardado) as SeleccionBoleto[]) : [];
  } catch {
    return [];
  }
}

/**
 * Boleto compartido entre la cartelera y el detalle (research.md §13): vive en un contexto de React y en
 * `sessionStorage`, así sobrevive a la navegación y a recargar la página, pero no a cerrar la pestaña.
 */
export function ProveedorBoleto({ children }: { children: ReactNode }) {
  const [selecciones, despachar] = useReducer(reducirBoleto, [], leerGuardado);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CLAVE_ALMACEN, JSON.stringify(selecciones));
    } catch {
      // Sin almacenamiento (modo privado estricto) el boleto sigue funcionando en memoria.
    }
  }, [selecciones]);

  return (
    <ContextoBoleto.Provider value={{ selecciones, despachar }}>{children}</ContextoBoleto.Provider>
  );
}

export function useBoleto(): Boleto {
  const boleto = useContext(ContextoBoleto);
  if (!boleto) throw new Error('useBoleto debe usarse dentro de <ProveedorBoleto>');
  return boleto;
}
