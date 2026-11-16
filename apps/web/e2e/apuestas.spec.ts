import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  acreditarSaldo,
  adelantarInicio,
  type Apostador,
  apuestasDe,
  cambiarCuota,
  cerrarBase,
  crearApostador,
  crearPartido,
  type PartidoDePrueba,
  saldoReal,
} from './utilidades/datos-apuestas';

// Spec 3, criterio de cierre de F4 (T049): con la web, la API y PostgreSQL reales, es imposible apostar sin saldo,
// después de la hora de inicio o con una cuota distinta de la que se vio. T073: lo mismo a 360 px (proyecto
// movil-360) y armando el boleto solo con el teclado.
//
// Un solo apostador por proyecto, en serie: el registro y el inicio de sesión aceptan 5 peticiones por minuto.

type Cookies = Awaited<ReturnType<ReturnType<Page['context']>['cookies']>>;

let apostador: Apostador;
let cookies: Cookies;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }, info) => {
  const baseURL = info.project.use.baseURL!;
  const peticiones = await playwright.request.newContext({ baseURL });
  apostador = await crearApostador(peticiones, new URL(baseURL).origin);
  cookies = (await peticiones.storageState()).cookies;
  await peticiones.dispose();
});

test.afterAll(cerrarBase);

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
});

async function abrirPartido(page: Page, partido: PartidoDePrueba): Promise<void> {
  await page.goto(`/partidos/${partido.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: `${partido.local} vs ${partido.visitante}` }),
  ).toBeVisible();
}

const botonLocal = (page: Page, partido: PartidoDePrueba): Locator =>
  page.getByRole('button', { name: new RegExp(`^${partido.local}`) });

const boleto = (page: Page): Locator => page.getByRole('complementary', { name: /boleto/i });

async function sinDesbordeHorizontal(page: Page): Promise<void> {
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda).toBe(false);
}

/** Avanza con Tab hasta que `destino` tiene el foco: falla si no es alcanzable con el teclado. */
async function tabularHasta(page: Page, destino: Locator, maximo = 80): Promise<void> {
  for (let paso = 0; paso < maximo; paso++) {
    if (await destino.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(destino).toBeFocused();
}

test('sin saldo no se apuesta, y el boleto se arma solo con el teclado', async ({ page }) => {
  const partido = await crearPartido();

  await page.goto('/partidos');
  await expect(page.getByRole('heading', { level: 1, name: 'Cartelera' })).toBeVisible();
  await sinDesbordeHorizontal(page);

  await abrirPartido(page, partido);
  await tabularHasta(page, botonLocal(page, partido));
  await page.keyboard.press('Enter');
  await expect(botonLocal(page, partido)).toHaveAttribute('aria-pressed', 'true');
  await expect(boleto(page)).toContainText(partido.local);

  await tabularHasta(page, page.getByLabel('Monto en dólares'));
  await page.keyboard.type('10');
  await tabularHasta(page, page.getByRole('button', { name: 'Confirmar apuesta' }));
  await page.keyboard.press('Enter');

  await expect(boleto(page).getByRole('alert')).toContainText('Saldo insuficiente');
  await sinDesbordeHorizontal(page);
  expect(await apuestasDe(apostador.id)).toBe(0);
});

test('con una cuota distinta de la vista no se acepta hasta reconfirmar', async ({ page }) => {
  await acreditarSaldo(apostador.id, '50.00');
  const partido = await crearPartido('1.80');

  await abrirPartido(page, partido);
  await botonLocal(page, partido).click();
  await page.getByLabel('Monto en dólares').fill('10');
  await cambiarCuota(partido.seleccionLocalId, '2.05');
  await page.getByRole('button', { name: 'Confirmar apuesta' }).click();

  await expect(boleto(page).getByRole('alert')).toContainText('Las cuotas cambiaron');
  await expect(boleto(page)).toContainText('2.05');
  expect(await apuestasDe(apostador.id)).toBe(0);
  expect(await saldoReal(apostador.id)).toBe('50.00');

  await page.getByRole('button', { name: 'Confirmar con las cuotas nuevas' }).click();
  await expect(boleto(page).getByRole('status')).toContainText('Apuesta aceptada');
  expect(await apuestasDe(apostador.id)).toBe(1);
  expect(await saldoReal(apostador.id)).toBe('40.00');
});

test('después de la hora de inicio no se acepta una apuesta pre-partido', async ({ page }) => {
  const partido = await crearPartido();

  await abrirPartido(page, partido);
  await botonLocal(page, partido).click();
  await page.getByLabel('Monto en dólares').fill('5');
  await adelantarInicio(partido.id);
  await page.getByRole('button', { name: 'Confirmar apuesta' }).click();

  await expect(boleto(page).getByRole('alert')).toContainText('ya no acepta apuestas');
  expect(await apuestasDe(apostador.id)).toBe(1);
  expect(await saldoReal(apostador.id)).toBe('40.00');
});

test('mis apuestas muestra la única apuesta aceptada', async ({ page }) => {
  await page.goto('/mis-apuestas');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis apuestas' })).toBeVisible();
  await expect(page.getByText('Pendiente', { exact: true })).toHaveCount(1);
  await sinDesbordeHorizontal(page);
});
