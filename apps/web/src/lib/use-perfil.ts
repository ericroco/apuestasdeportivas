'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, type Perfil, SesionVencida } from './api-cliente';

/** Perfil del usuario con sesión; sin sesión, lleva a iniciar sesión. `recargar()` lo vuelve a pedir. */
export function usePerfil() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    api<Perfil>('/identidad/yo')
      .then((datos) => {
        if (vigente) setPerfil(datos);
      })
      .catch((error: unknown) => {
        if (error instanceof SesionVencida) router.replace('/iniciar-sesion');
      });
    return () => {
      vigente = false;
    };
  }, [router, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { perfil, recargar };
}
