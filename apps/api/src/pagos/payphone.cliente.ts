import { Inject, Injectable } from '@nestjs/common';
import { ENTORNO, type Entorno } from '../config/env.js';
import {
  type ConfirmacionPasarela,
  type PagoPreparado,
  PasarelaNoDisponibleError,
  type PasarelaPort,
  type SolicitudPreparar,
} from './pasarela.port.js';

const TIMEOUT_MS = 15_000;

/**
 * Botón de pago por redirección de Payphone (https://docs.payphone.app/boton-de-pago-por-redireccion). El token
 * solo vive en la API. Prepare → el usuario paga → Payphone redirige con `id` y `clientTransactionId` → Confirm
 * (dentro de los 5 minutos; si no, Payphone revierte el pago solo).
 */
@Injectable()
export class PayphoneCliente implements PasarelaPort {
  constructor(@Inject(ENTORNO) private readonly entorno: Entorno) {}

  async preparar(solicitud: SolicitudPreparar): Promise<PagoPreparado> {
    const respuesta = await this.post<{ paymentId: string; payWithCard: string }>(
      '/api/button/Prepare',
      {
        amount: solicitud.montoCentavos,
        amountWithoutTax: solicitud.montoCentavos,
        currency: 'USD',
        clientTransactionId: solicitud.referencia,
        storeId: this.entorno.PAYPHONE_STORE_ID,
        reference: 'Depósito en Apuestas deportivas',
        responseUrl: solicitud.urlRespuesta,
        cancellationUrl: solicitud.urlCancelacion,
        timeZone: -5,
        lang: 'es',
      },
    );
    return { paymentId: String(respuesta.paymentId), urlPago: respuesta.payWithCard };
  }

  confirmar(id: number, referencia: string): Promise<ConfirmacionPasarela> {
    return this.post<ConfirmacionPasarela>('/api/button/V2/Confirm', {
      id,
      clientTxId: referencia,
    });
  }

  async reversar(transactionId: number): Promise<void> {
    await this.post('/api/Reverse', { id: transactionId });
  }

  private async post<T>(ruta: string, cuerpo: unknown): Promise<T> {
    if (!this.entorno.PAYPHONE_TOKEN) {
      throw new PasarelaNoDisponibleError('Los pagos no están configurados (falta PAYPHONE_TOKEN)');
    }
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.entorno.PAYPHONE_BASE_URL}${ruta}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.entorno.PAYPHONE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new PasarelaNoDisponibleError(`Payphone no respondió: ${(error as Error).message}`);
    }
    if (!respuesta.ok) {
      throw new PasarelaNoDisponibleError(`Payphone respondió ${respuesta.status} en ${ruta}`);
    }
    return (await respuesta.json()) as T;
  }
}
