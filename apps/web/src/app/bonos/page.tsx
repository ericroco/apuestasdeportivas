import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MisBonos } from '@/components/bonos/mis-bonos';
import { Cargando } from '@/components/comun/cargando';
import { EstadoAcceso } from '@/components/comun/estado-acceso';
import { Hoja } from '@/components/comun/hoja';
import { obtenerMisBonos } from '@/lib/servidor/promociones';
import { clienteApiDeLaSesion } from '@/lib/servidor/sesion';

export const metadata: Metadata = {
  title: 'Mis bonos | Apuestas deportivas',
  description: 'Avance del rollover de tu bono, bonos anteriores y cupones rechazados.',
};

/** Lee la sesión en la petición, por eso va dentro de `<Suspense>`. */
async function ContenidoBonos() {
  const resultado = await obtenerMisBonos(await clienteApiDeLaSesion());
  if (resultado.tipo !== 'ok') {
    return (
      <EstadoAcceso fallo={resultado} rol="apostador" que="tus bonos" reintentarHref="/bonos" />
    );
  }
  return <MisBonos bonos={resultado.datos} />;
}

export default function PaginaMisBonos() {
  return (
    <Hoja
      seccion="Apostador"
      titulo="Mis bonos"
      descripcion="El saldo de bono no se retira: pasa a tu saldo real cuando cumples el rollover."
    >
      <Suspense fallback={<Cargando texto="Consultando tus bonos…" />}>
        <ContenidoBonos />
      </Suspense>
    </Hoja>
  );
}
