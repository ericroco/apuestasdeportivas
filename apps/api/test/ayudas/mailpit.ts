/** Lee los correos que capturó Mailpit (docker compose y CI) para las pruebas de verificación y recuperación. */
const URL_MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';

interface Resumen {
  ID: string;
  Subject: string;
}

export interface CorreoRecibido {
  readonly asunto: string;
  readonly texto: string;
}

export async function correosPara(email: string): Promise<CorreoRecibido[]> {
  const busqueda = await fetch(
    `${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  ).then((r) => r.json() as Promise<{ messages: Resumen[] }>);
  return Promise.all(
    busqueda.messages.map(async ({ ID, Subject }) => {
      const mensaje = await fetch(`${URL_MAILPIT}/api/v1/message/${ID}`).then(
        (r) => r.json() as Promise<{ Text: string }>,
      );
      return { asunto: Subject, texto: mensaje.Text };
    }),
  );
}

/** Espera (hasta 5 s) a que llegue un correo con ese asunto y lo devuelve. */
export async function esperarCorreo(email: string, asunto: string): Promise<CorreoRecibido> {
  for (let intento = 0; intento < 25; intento++) {
    const correo = (await correosPara(email)).find((c) => c.asunto === asunto);
    if (correo) return correo;
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  throw new Error(`No llegó a Mailpit el correo "${asunto}" para ${email}`);
}

/** Token del primer enlace `?token=` del correo. */
export function tokenDelCorreo(correo: CorreoRecibido): string {
  const coincidencia = /[?&]token=([^\s&]+)/.exec(correo.texto);
  if (!coincidencia?.[1])
    throw new Error(`El correo "${correo.asunto}" no trae un enlace con token`);
  return decodeURIComponent(coincidencia[1]);
}
