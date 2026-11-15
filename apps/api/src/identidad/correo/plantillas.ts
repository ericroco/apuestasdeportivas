import type { Correo } from './correo.port.js';

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function html(titulo: string, parrafos: string[], enlace?: { texto: string; url: string }): string {
  const cuerpo = parrafos.map((p) => `<p>${escapar(p)}</p>`).join('');
  const boton = enlace
    ? `<p><a href="${escapar(enlace.url)}" style="background:#0b6e4f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapar(enlace.texto)}</a></p><p style="font-size:13px;color:#555">Si el botón no funciona, copia este enlace: ${escapar(enlace.url)}</p>`
    : '';
  return `<!doctype html><html lang="es"><body style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#1a1a1a"><h1 style="font-size:20px">${escapar(titulo)}</h1>${cuerpo}${boton}</body></html>`;
}

export function correoVerificacion(para: string, nombre: string, url: string): Correo {
  const parrafos = [
    `Hola, ${nombre}.`,
    'Confirma tu correo para poder depositar, apostar y retirar. El enlace vence en 24 horas y sirve una sola vez.',
  ];
  return {
    para,
    asunto: 'Confirma tu correo',
    texto: `${parrafos.join('\n\n')}\n\nConfirmar correo: ${url}`,
    html: html('Confirma tu correo', parrafos, { texto: 'Confirmar correo', url }),
  };
}

export function correoCuentaExistente(para: string, urlInicio: string): Correo {
  const parrafos = [
    'Alguien intentó crear una cuenta con este correo, que ya está registrado.',
    'Si fuiste tú, inicia sesión o recupera tu contraseña. Si no, puedes ignorar este mensaje.',
  ];
  return {
    para,
    asunto: 'Ya tienes una cuenta',
    texto: `${parrafos.join('\n\n')}\n\nIniciar sesión: ${urlInicio}`,
    html: html('Ya tienes una cuenta', parrafos, { texto: 'Iniciar sesión', url: urlInicio }),
  };
}

export function correoRecuperacion(para: string, url: string): Correo {
  const parrafos = [
    'Recibimos un pedido para cambiar tu contraseña. El enlace vence en 1 hora y sirve una sola vez.',
    'Al cambiarla se cerrarán todas tus sesiones. Si no lo pediste, ignora este mensaje.',
  ];
  return {
    para,
    asunto: 'Cambia tu contraseña',
    texto: `${parrafos.join('\n\n')}\n\nCambiar contraseña: ${url}`,
    html: html('Cambia tu contraseña', parrafos, { texto: 'Cambiar contraseña', url }),
  };
}
