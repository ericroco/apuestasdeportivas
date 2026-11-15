import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cargando } from '@/components/comun/cargando';
import { EstadoAcceso } from '@/components/comun/estado-acceso';
import { Hoja } from '@/components/comun/hoja';
import { FormularioCupon } from '@/components/cupones/formulario-cupon';
import { leerTokenAcceso } from '@/lib/servidor/sesion';
import { crearCuponAccion } from '../acciones';

export const metadata: Metadata = { title: 'Crear cupón | Apuestas deportivas' };

/**
 * Sin cookie de sesión no tiene sentido llenar el formulario. El rol lo comprueba la API al crear: si no
 * alcanza, la acción lo explica.
 */
async function FormularioSiHaySesion() {
  if ((await leerTokenAcceso()) === null) {
    return (
      <EstadoAcceso
        fallo={{ tipo: 'sin-sesion' }}
        rol="operador o administrador"
        que="la creación de cupones"
        reintentarHref="/operador/cupones/nuevo"
      />
    );
  }
  return <FormularioCupon accion={crearCuponAccion} />;
}

export default function PaginaNuevoCupon() {
  return (
    <Hoja
      seccion="Operador"
      titulo="Crear cupón"
      descripcion="El cupón queda activo y empieza a aceptar canjes desde su inicio. Mientras no tenga canjes se puede corregir; después solo se pausa, se extiende o se amplía."
      migas={[{ texto: 'Cupones', href: '/operador/cupones' }]}
    >
      <Suspense fallback={<Cargando texto="Preparando el formulario…" />}>
        <FormularioSiHaySesion />
      </Suspense>
    </Hoja>
  );
}
