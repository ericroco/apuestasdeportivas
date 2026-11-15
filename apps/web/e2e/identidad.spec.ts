import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

// Spec 2, PR 1: de punta a punta por el proxy /api/* de la web (cookies del dominio de la web).
// Registro → confirmación del correo (Mailpit) → inicio de sesión → Mi cuenta → cierre de sesión.

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const CONTRASENA = 'Clave-E2E-Segura-2026';

/** Turnstile falso: el servidor usa el secreto de prueba de Cloudflare, que acepta cualquier token. */
async function simularTurnstile(pagina: Page): Promise<void> {
  await pagina.route('https://challenges.cloudflare.com/**', (ruta) =>
    ruta.fulfill({
      contentType: 'application/javascript',
      body: `window.turnstile = {
        render: (_el, opciones) => { setTimeout(() => opciones.callback('token-e2e'), 0); return 'w1'; },
        reset: () => {}, remove: () => {},
      };`,
    }),
  );
}

async function enlaceDelCorreo(email: string, asunto: string): Promise<string> {
  for (let intento = 0; intento < 30; intento++) {
    const busqueda = (await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    ).then((r) => r.json())) as { messages: { ID: string; Subject: string }[] };
    const mensaje = busqueda.messages.find((m) => m.Subject === asunto);
    if (mensaje) {
      const { Text } = (await fetch(`${MAILPIT}/api/v1/message/${mensaje.ID}`).then((r) =>
        r.json(),
      )) as { Text: string };
      const enlace = /https?:\/\/\S+token=\S+/.exec(Text)?.[0];
      if (enlace) return new URL(enlace).pathname + new URL(enlace).search;
    }
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  throw new Error(`No llegó el correo "${asunto}" a ${email}`);
}

test('un visitante se registra, confirma su correo, inicia sesión y la cierra', async ({
  page,
}) => {
  await simularTurnstile(page);
  const email = `e2e-${randomUUID()}@prueba.local`;

  await page.goto('/registro');
  await page.getByLabel('Nombre completo').fill('Persona E2E');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByLabel('Fecha de nacimiento').fill('1994-03-10');
  await page.getByLabel(/Declaro que soy mayor de edad/).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('status')).toContainText('te enviamos un correo');

  await page.goto(await enlaceDelCorreo(email, 'Confirma tu correo'));
  await expect(page.getByRole('status')).toContainText('tu correo quedó confirmado');

  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText('Persona E2E')).toBeVisible();
  // La sesión viaja en cookies httpOnly del dominio de la web: los scripts de la página no la ven.
  expect(await page.evaluate(() => document.cookie)).not.toContain('acceso');

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  await page.goto('/cuenta');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});
