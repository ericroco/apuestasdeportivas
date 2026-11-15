/**
 * Cliente del navegador para la API (siempre a través del proxy `/api/*` de la propia web). Si el acceso venció,
 * renueva la sesión una vez y repite la petición; ante 409 (otra pestaña renovando) espera y reintenta.
 * La web nunca calcula montos ni saldos: solo muestra lo que devuelve la API (principio III).
 */

export class ErrorApi extends Error {
  override readonly name = 'ErrorApi';
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** La sesión no se pudo renovar: hay que volver a iniciar sesión. */
export class SesionVencida extends ErrorApi {}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

function mensajeDe(cuerpo: unknown, estado: number): string {
  const mensaje = (cuerpo as { message?: unknown } | null)?.message;
  if (typeof mensaje === 'string') return mensaje;
  if (Array.isArray(mensaje) && typeof mensaje[0] === 'string') return mensaje[0];
  if (estado === 429) return 'Hiciste demasiados intentos. Espera un momento y vuelve a probar.';
  return 'Algo salió mal. Inténtalo de nuevo en unos segundos.';
}

async function renovar(): Promise<boolean> {
  for (let intento = 0; intento < 3; intento++) {
    const respuesta = await fetch('/api/identidad/sesion/renovar', { method: 'POST' });
    if (respuesta.status === 204) return true;
    if (respuesta.status !== 409) return false;
    await new Promise((resolver) => setTimeout(resolver, 400));
  }
  return false;
}

export async function api<T = unknown>(
  ruta: string,
  opciones: { metodo?: Metodo; cuerpo?: unknown } = {},
): Promise<T> {
  const pedir = () =>
    fetch(`/api${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: opciones.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });

  let respuesta = await pedir();
  if (respuesta.status === 401 && !ruta.startsWith('/identidad/sesion')) {
    if (!(await renovar()))
      throw new SesionVencida(401, 'Tu sesión terminó. Vuelve a iniciar sesión.');
    respuesta = await pedir();
  }
  if (respuesta.status === 204) return undefined as T;
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, mensajeDe(cuerpo, respuesta.status));
  return cuerpo as T;
}

/** Perfil del usuario actual (GET /identidad/yo). */
export interface Perfil {
  readonly id: string;
  readonly email: string;
  readonly nombreCompleto: string;
  readonly roles: readonly ('APOSTADOR' | 'OPERADOR' | 'ADMINISTRADOR')[];
  readonly verificado: boolean;
  readonly tiene2fa: boolean;
  readonly alcance: 'completo' | 'activar-2fa';
}
