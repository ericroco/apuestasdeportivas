'use client';

import { useCallback, useEffect, useState } from 'react';
import { Aviso, Boton, Enlace, Tarjeta } from '@/components/ui';
import { api, ErrorApi } from '@/lib/api-cliente';

interface EstadoDeposito {
  estado: 'PENDIENTE' | 'CONFIRMADA' | 'FALLIDA' | 'CADUCADA' | 'RECHAZADA_DISCREPANCIA';
  monto: string;
  motivoFallo: string | null;
}

function parametros() {
  if (typeof window === 'undefined') return { id: '', referencia: '', cancelado: false };
  const p = new URLSearchParams(window.location.search);
  return {
    id: p.get('id') ?? '',
    referencia: p.get('clientTransactionId') ?? '',
    cancelado: p.get('cancelado') === '1',
  };
}

/**
 * Regreso desde Payphone (research §9). Esta página NO acredita nada: solo pide a la API que confirme el pago con
 * Payphone servidor a servidor (FR-047) y muestra lo que la API responde.
 */
export default function PaginaRetornoDeposito() {
  const [{ id, referencia, cancelado }] = useState(parametros);
  const [resultado, setResultado] = useState<EstadoDeposito | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const confirmar = useCallback(() => {
    if (!id || !referencia) return Promise.resolve();
    return api<EstadoDeposito>('/pagos/depositos/confirmar', {
      metodo: 'POST',
      cuerpo: { id: Number(id), clientTransactionId: referencia },
    })
      .then((datos) => {
        setError(null);
        setResultado(datos);
      })
      .catch((e: unknown) =>
        setError(e instanceof ErrorApi ? e.message : 'No pudimos confirmar el pago.'),
      );
  }, [id, referencia]);

  useEffect(() => {
    if (!cancelado) void confirmar();
  }, [cancelado, confirmar, intento]);

  return (
    <Tarjeta antetitulo="Billetera" titulo="Tu depósito">
      {cancelado || (!id && !error) ? (
        <Aviso tipo="info">Cancelaste el pago en Payphone. No se cobró ni se acreditó nada.</Aviso>
      ) : error ? (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <Boton type="button" variante="secundario" onClick={() => setIntento((n) => n + 1)}>
            Volver a confirmar
          </Boton>
        </>
      ) : !resultado ? (
        <Aviso tipo="info">Confirmando tu pago con Payphone…</Aviso>
      ) : resultado.estado === 'CONFIRMADA' ? (
        <Aviso tipo="exito">Listo: acreditamos ${resultado.monto} en tu saldo real.</Aviso>
      ) : (
        <Aviso tipo="error">
          No acreditamos este depósito.{' '}
          {resultado.motivoFallo ?? 'Inténtalo de nuevo desde la billetera.'}
        </Aviso>
      )}
      <p className="mt-5 text-sm">
        <Enlace href="/billetera">Ir a mi billetera</Enlace>
      </p>
    </Tarjeta>
  );
}
