import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENTORNO, type Entorno } from '../config/env.js';

const URL_VERIFICACION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5_000;

/**
 * Verifica el CAPTCHA de Cloudflare Turnstile en el servidor (FR-001, FR-008, FR-067). Los secretos de prueba de
 * Cloudflare (`1x…` aprueba, `2x…` rechaza, `3x…` "token usado") se resuelven aquí sin red, igual que lo haría
 * Cloudflare: así las pruebas no dependen de internet. En producción esos secretos están prohibidos (env.ts).
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(@Inject(ENTORNO) private readonly entorno: Entorno) {}

  async verificar(token: string, ip: string): Promise<boolean> {
    const secreto = this.entorno.TURNSTILE_SECRET;
    if (/^1x0+AA$/.test(secreto)) return token.length > 0;
    if (/^[23]x0+AA$/.test(secreto)) return false;

    try {
      const respuesta = await fetch(URL_VERIFICACION, {
        method: 'POST',
        body: new URLSearchParams({ secret: secreto, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const resultado = (await respuesta.json()) as { success?: boolean; hostname?: string };
      if (resultado.success !== true) return false;
      // En producción se comprueba además que el widget se resolvió en nuestra web.
      return (
        this.entorno.NODE_ENV !== 'production' ||
        resultado.hostname === new URL(this.entorno.WEB_ORIGIN).hostname
      );
    } catch (error) {
      // Turnstile caído = rechazo (falla cerrado).
      this.logger.warn(`No se pudo verificar el CAPTCHA: ${(error as Error).message}`);
      return false;
    }
  }
}
