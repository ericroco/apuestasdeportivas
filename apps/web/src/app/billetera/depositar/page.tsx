'use client';

import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';

/** HU5: el servidor registra la intención y prepara el pago; el navegador solo se redirige a Payphone. */
export default function PaginaDepositar() {
  const { enviando, error, enviar } = useFormulario();

  const alEnviar = enviar(async (datos) => {
    const codigoCupon = texto(datos, 'codigoCupon').trim();
    const { urlPago } = await api<{ urlPago: string }>('/pagos/depositos', {
      metodo: 'POST',
      cuerpo: {
        monto: texto(datos, 'monto').replace(',', '.').trim(),
        ...(codigoCupon ? { codigoCupon } : {}),
      },
    });
    window.location.assign(urlPago);
  });

  return (
    <Tarjeta antetitulo="Billetera" titulo="Depositar">
      <form onSubmit={alEnviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo
          etiqueta="Monto en dólares"
          name="monto"
          inputMode="decimal"
          placeholder="25.00"
          required
          pattern="^\d{1,7}([.,]\d{1,2})?$"
          ayuda="Entre 1.00 y 1000.00 USD. Pagarás en Payphone (modo de pruebas: no se cobra dinero real)."
        />
        <Campo
          etiqueta="Código de cupón (opcional)"
          name="codigoCupon"
          autoComplete="off"
          maxLength={40}
        />
        <Boton cargando={enviando}>Ir a pagar con Payphone</Boton>
      </form>
      <p className="text-tinta-suave mt-4 text-sm">
        Tu saldo se acredita cuando confirmamos el pago directamente con Payphone, no al volver a
        esta página.
      </p>
      <p className="mt-5 text-sm">
        <Enlace href="/billetera">Volver a la billetera</Enlace>
      </p>
    </Tarjeta>
  );
}
