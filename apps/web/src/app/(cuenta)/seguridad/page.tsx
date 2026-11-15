'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso, Boton, Campo, Enlace, Tarjeta } from '@/components/ui';
import { api } from '@/lib/api-cliente';
import { texto, useFormulario } from '@/lib/use-formulario';
import { usePerfil } from '@/lib/use-perfil';

/** HU6: activar o desactivar el segundo factor. Obligatorio para operador y administrador (FR-021). */
export default function PaginaSeguridad() {
  const router = useRouter();
  const { perfil, recargar } = usePerfil();
  const formulario = useFormulario();
  const [qr, setQr] = useState<{ qrDataUrl: string; otpauthUrl: string } | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);

  const generar = formulario.enviar(async () => {
    setQr(
      await api<{ qrDataUrl: string; otpauthUrl: string }>('/identidad/2fa/activacion', {
        metodo: 'POST',
      }),
    );
  });

  const confirmar = formulario.enviar(async (datos) => {
    const { codigosRecuperacion } = await api<{ codigosRecuperacion: string[] }>(
      '/identidad/2fa/activacion/confirmar',
      { metodo: 'POST', cuerpo: { codigo: texto(datos, 'codigo').replace(/\s/g, '') } },
    );
    setQr(null);
    setCodigos(codigosRecuperacion);
    recargar();
  });

  const desactivar = formulario.enviar(async (datos) => {
    await api('/identidad/2fa/desactivar', {
      metodo: 'POST',
      cuerpo: { codigo: texto(datos, 'codigo').replace(/\s/g, '') },
    });
    recargar();
    return 'Desactivaste el segundo factor. Lo necesitarás de nuevo para retirar.';
  });

  if (!perfil) {
    return (
      <Tarjeta titulo="Seguridad">
        <Aviso tipo="info">Cargando…</Aviso>
      </Tarjeta>
    );
  }

  const conPrivilegios = perfil.roles.some((rol) => rol !== 'APOSTADOR');
  const secreto = qr ? new URL(qr.otpauthUrl).searchParams.get('secret') : null;

  return (
    <Tarjeta titulo="Seguridad">
      {formulario.error && <Aviso tipo="error">{formulario.error}</Aviso>}
      {formulario.exito && <Aviso tipo="exito">{formulario.exito}</Aviso>}

      {codigos ? (
        <section aria-labelledby="titulo-codigos">
          <h2 id="titulo-codigos" className="font-display mb-2 text-2xl font-bold">
            Guarda tus códigos de recuperación
          </h2>
          <p className="mb-3 text-sm">
            Cada uno sirve una sola vez si pierdes tu teléfono. No los volverás a ver: guárdalos en
            un lugar seguro.
          </p>
          <ul
            className="mb-4 grid grid-cols-2 gap-2 font-mono text-base"
            aria-label="Códigos de recuperación"
          >
            {codigos.map((codigo) => (
              <li key={codigo} className="rounded bg-white px-2 py-1 text-center">
                {codigo}
              </li>
            ))}
          </ul>
          <Boton type="button" onClick={() => router.push('/cuenta')}>
            Ya los guardé
          </Boton>
        </section>
      ) : perfil.tiene2fa ? (
        <>
          <Aviso tipo="exito">Tu segundo factor está activo.</Aviso>
          {conPrivilegios ? (
            <p className="text-sm">Es obligatorio para tu rol, así que no se puede desactivar.</p>
          ) : (
            <form onSubmit={desactivar}>
              <Campo
                etiqueta="Código para desactivarlo"
                name="codigo"
                autoComplete="one-time-code"
                required
              />
              <Boton variante="peligro" cargando={formulario.enviando}>
                Desactivar segundo factor
              </Boton>
            </form>
          )}
        </>
      ) : qr ? (
        <form onSubmit={confirmar}>
          <p className="mb-3 text-sm">
            Escanea el código con una aplicación de autenticación (Google Authenticator, Authy…) y
            escribe el código que te muestra.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada por la API */}
          <img
            src={qr.qrDataUrl}
            alt="Código QR para tu aplicación de autenticación"
            className="mx-auto mb-3 size-48"
          />
          {secreto && (
            <p className="text-tinta-suave mb-4 text-center text-sm break-all">
              ¿No puedes escanear? Clave: <span className="font-mono">{secreto}</span>
            </p>
          )}
          <Campo
            etiqueta="Código de 6 dígitos"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          <Boton cargando={formulario.enviando}>Activar segundo factor</Boton>
        </form>
      ) : (
        <form onSubmit={generar}>
          {perfil.alcance === 'activar-2fa' && (
            <Aviso tipo="info">Tu rol exige el segundo factor. Actívalo para continuar.</Aviso>
          )}
          <p className="mb-4 text-sm">
            El segundo factor protege tu cuenta con un código de tu teléfono. Es obligatorio para
            retirar dinero.
          </p>
          <Boton cargando={formulario.enviando}>Configurar segundo factor</Boton>
        </form>
      )}

      {!codigos && (
        <p className="mt-6 text-sm">
          <Enlace href="/cuenta">Volver a mi cuenta</Enlace>
        </p>
      )}
    </Tarjeta>
  );
}
