export interface Correo {
  readonly para: string;
  readonly asunto: string;
  readonly texto: string;
  readonly html: string;
}

/** Envío de correos transaccionales (research §7): SMTP con Mailpit en local y CI, Resend en staging. */
export interface CorreoPort {
  enviar(correo: Correo): Promise<void>;
}

export const CORREO_PORT = Symbol('CORREO_PORT');
