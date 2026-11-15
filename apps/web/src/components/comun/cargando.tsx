interface CargandoProps {
  readonly texto: string;
}

/** Respaldo de `<Suspense>` mientras el servidor consulta la API o reportes. */
export function Cargando({ texto }: CargandoProps) {
  return (
    <p aria-busy="true" className="text-tinta-suave py-6">
      {texto}
    </p>
  );
}
