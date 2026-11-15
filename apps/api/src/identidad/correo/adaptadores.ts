import nodemailer, { type Transporter } from 'nodemailer';
import type { Entorno } from '../../config/env.js';
import type { Correo, CorreoPort } from './correo.port.js';

export class CorreoSmtp implements CorreoPort {
  private readonly transporte: Transporter;

  constructor(private readonly entorno: Entorno) {
    this.transporte = nodemailer.createTransport(entorno.SMTP_URL);
  }

  async enviar(correo: Correo): Promise<void> {
    await this.transporte.sendMail({
      from: this.entorno.CORREO_REMITENTE,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
  }
}

/** API HTTP de Resend: el plan gratuito de Render puede bloquear el SMTP saliente. */
export class CorreoResend implements CorreoPort {
  constructor(private readonly entorno: Entorno) {}

  async enviar(correo: Correo): Promise<void> {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.entorno.RESEND_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.entorno.CORREO_REMITENTE,
        to: [correo.para],
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) throw new Error(`Resend respondió ${respuesta.status}`);
  }
}

export function crearCorreo(entorno: Entorno): CorreoPort {
  return entorno.CORREO_TRANSPORTE === 'resend'
    ? new CorreoResend(entorno)
    : new CorreoSmtp(entorno);
}
