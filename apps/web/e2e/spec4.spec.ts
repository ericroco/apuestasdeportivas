import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Spec 4 (T064): pantallas de cupones, mis bonos, alertas y reportes a 360 px y en escritorio, contra la
// API y reportes simulados (e2e/simulado). La sesión es la cookie httpOnly `acceso` del contrato 6.
const TOKENS = {
  apostador: 'token-apostador',
  operador: 'token-operador',
  administrador: 'token-admin',
} as const;

const URL_API_SIMULADA = `http://127.0.0.1:${process.env.E2E_API_SIMULADA_PORT ?? 4010}`;

async function iniciarSesion(page: Page, rol: keyof typeof TOKENS): Promise<void> {
  const url = test.info().project.use.baseURL;
  await page
    .context()
    .addCookies([{ name: 'acceso', value: TOKENS[rol], url, httpOnly: true, sameSite: 'Lax' }]);
}

async function sinDesbordeHorizontal(page: Page): Promise<void> {
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda).toBe(false);
}

/** Código único por proyecto y ejecución: los proyectos corren en paralelo contra el mismo simulador. */
function codigoUnico(): string {
  const proyecto = test.info().project.name.includes('movil') ? 'M' : 'E';
  return `E2E${proyecto}${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
}

test.describe('Cupones del operador', () => {
  test('sin sesión pide iniciar sesión y un apostador no tiene permiso', async ({ page }) => {
    await page.goto('/operador/cupones');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();

    await iniciarSesion(page, 'apostador');
    await page.goto('/operador/cupones');
    await expect(
      page.getByRole('heading', { name: 'No tienes permiso para ver esta sección' }),
    ).toBeVisible();
  });

  test('lista los cupones y filtra por estado desde la URL', async ({ page }) => {
    await iniciarSesion(page, 'operador');
    await page.goto('/operador/cupones');

    const lista = page.getByRole('list', { name: 'Cupones' });
    await expect(lista.getByRole('link', { name: 'BIENVENIDA10' })).toBeVisible();
    await expect(lista).toContainText('40 de 500');
    await sinDesbordeHorizontal(page);

    await page.getByLabel('Estado').selectOption('PAUSADO');
    await page.getByRole('button', { name: 'Filtrar cupones' }).click();
    await expect(page).toHaveURL(/estado=PAUSADO/);
    await expect(lista.getByRole('link', { name: 'GRATIS5' })).toBeVisible();
    await expect(lista.getByRole('link', { name: 'BIENVENIDA10' })).toHaveCount(0);
  });

  test('crea un cupón de aumento de cuota, lo ve con 0 canjes y lo pausa', async ({ page }) => {
    const codigo = codigoUnico();
    await iniciarSesion(page, 'operador');
    await page.goto('/operador/cupones/nuevo');

    await page.getByLabel('Código').fill(codigo.toLowerCase());
    await page.getByRole('radio', { name: /Aumento de cuota/ }).check();
    await expect(page.getByLabel('Tope del bono (USD)')).toHaveCount(0);
    await page.getByLabel('Aumento de la cuota').fill('10');
    await page.getByLabel('Apuesta máxima (USD)').fill('20');
    await page.getByLabel('Inicio').fill('2026-01-01T00:00');
    await page.getByLabel('Fin').fill('2030-12-31T23:59');
    await page.getByLabel('Cupo total').fill('50');
    await sinDesbordeHorizontal(page);
    await page.getByRole('button', { name: 'Crear cupón' }).click();

    await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
    await expect(
      page.getByText('Cupón creado. Ya aparece en la lista con 0 canjes.'),
    ).toBeVisible();
    await expect(page.getByText('+10 % a la cuota total')).toBeVisible();

    await page.getByRole('button', { name: 'Pausar cupón' }).click();
    const bloque = page.getByRole('form', { name: /Pausar|Reactivar/ });
    await expect(bloque.getByRole('status')).toHaveText(
      'Cupón pausado. No acepta canjes nuevos hasta que lo reactives.',
    );
    await expect(page.getByRole('button', { name: 'Reactivar cupón' })).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('explica el código duplicado y marca los campos inválidos', async ({ page }) => {
    await iniciarSesion(page, 'operador');
    await page.goto('/operador/cupones/nuevo');

    await page.getByRole('button', { name: 'Crear cupón' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Revisa los campos');
    await expect(page.getByLabel('Código')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Código').fill('bienvenida10');
    await page.getByRole('radio', { name: /Apuesta gratis/ }).check();
    await page.getByLabel('Monto de la apuesta gratis (USD)').fill('5');
    await page.getByLabel('Inicio').fill('2026-01-01T00:00');
    await page.getByLabel('Fin').fill('2030-12-31T23:59');
    await page.getByLabel('Cupo total').fill('10');
    await page.getByRole('button', { name: 'Crear cupón' }).click();

    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Ya existe un cupón con ese código',
    );
  });
});

test.describe('Mis bonos del apostador', () => {
  test('muestra el avance accesible del rollover, el historial y los rechazos', async ({
    page,
  }) => {
    await iniciarSesion(page, 'apostador');
    await page.goto('/bonos');

    const barra = page.getByRole('progressbar', { name: 'Avance del rollover' });
    await expect(barra).toHaveAttribute('aria-valuenow', '25');
    await expect(barra).toHaveAttribute('aria-valuetext', '$12,50 de $50,00 apostados (25 %)');
    await expect(page.getByRole('list', { name: 'Bonos anteriores' })).toContainText('Cumplido');
    await expect(page.getByRole('list', { name: 'Canjes rechazados' })).toContainText(
      'Ya tienes un bono activo',
    );
    await sinDesbordeHorizontal(page);
  });
});

test.describe('Alertas de fraude del administrador', () => {
  test('un operador no puede verlas', async ({ page }) => {
    await iniciarSesion(page, 'operador');
    await page.goto('/admin/alertas');

    await expect(
      page.getByRole('heading', { name: 'No tienes permiso para ver esta sección' }),
    ).toBeVisible();
  });

  test('filtra por severidad y resuelve una alerta con nota obligatoria', async ({
    page,
    request,
  }) => {
    const { id } = (await (
      await request.post(`${URL_API_SIMULADA}/__simulado/alertas`)
    ).json()) as {
      id: string;
    };
    await iniciarSesion(page, 'administrador');
    await page.goto('/admin/alertas?severidad=MEDIA');
    await expect(page.getByRole('list', { name: 'Alertas' })).toContainText('Ráfaga de apuestas');
    await expect(page.getByRole('list', { name: 'Alertas' })).not.toContainText('Severidad Alta');
    await sinDesbordeHorizontal(page);

    await page.goto(`/admin/alertas/${id}`);
    const evidencia = page.getByRole('region', { name: 'Evidencia' });
    await expect(evidencia).toContainText('disp-7f3a');
    await expect(evidencia).toContainText('usuario-beto');

    await page.getByLabel('Nota de la resolución').fill('ok');
    await page.getByRole('button', { name: 'Confirmar fraude' }).click();
    await expect(page.getByRole('status')).toContainText('al menos 5 caracteres');

    await page.getByLabel('Nota de la resolución').fill('Mismo titular en ambas cuentas');
    await page.getByRole('button', { name: 'Confirmar fraude' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Alerta confirmada como fraude. La resolución quedó registrada con tu nota.',
    );
    const resolucion = page.getByRole('region', { name: 'Resolución' });
    await expect(resolucion).toContainText('Fraude confirmado');
    await expect(resolucion).toContainText('Mismo titular en ambas cuentas');
    await sinDesbordeHorizontal(page);
  });
});

test.describe('Reportes del administrador', () => {
  const RANGO = 'desde=2026-12-01&hasta=2026-12-31';

  test('muestra métricas, la serie diaria y el desglose sin exponer el token', async ({ page }) => {
    await iniciarSesion(page, 'administrador');
    await page.goto(`/admin/reportes?${RANGO}`);

    const metricas = page.getByRole('region', { name: 'Métricas del periodo' });
    await expect(metricas).toContainText('$15.200,00');
    await expect(
      page.getByRole('img', { name: /Columnas del volumen apostado por día/ }),
    ).toBeVisible();
    await page.getByText('Ver la tabla de la serie diaria').click();
    await expect(page.getByRole('region', { name: 'Serie diaria' }).getByRole('row')).toHaveCount(
      32,
    );
    expect(await page.content()).not.toContain(TOKENS.administrador);
    await sinDesbordeHorizontal(page);

    await page.getByRole('link', { name: 'Ver solo esta competición' }).first().click();
    await expect(page).toHaveURL(/competicionId=0b6f7a1c/);
    await expect(page.getByText('Solo la competición')).toContainText('LigaPro');
    await expect(metricas).toContainText('$3.000,00');
  });

  test('descarga el CSV y el PDF con los filtros aplicados', async ({ page }) => {
    await iniciarSesion(page, 'administrador');
    await page.goto(`/admin/reportes?${RANGO}`);

    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descargar CSV' }).click(),
    ]);
    expect(csv.suggestedFilename()).toBe('reporte-2026-12-01-2026-12-31.csv');
    expect(await readFile(await csv.path(), 'utf8')).toContain('Volumen apostado;15200.00');

    const [pdf] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descargar PDF' }).click(),
    ]);
    expect(pdf.suggestedFilename()).toBe('reporte-2026-12-01-2026-12-31.pdf');
    expect(await readFile(await pdf.path(), 'utf8')).toMatch(/^%PDF/);
  });

  test('distingue sin datos, servicio caído, rango inválido y falta de permiso', async ({
    page,
  }) => {
    await iniciarSesion(page, 'administrador');
    await page.goto(`/admin/reportes?${RANGO}&usuario=vacio@correo.ec`);
    await expect(page.getByRole('status')).toContainText('Sin datos en este periodo.');

    await page.goto(`/admin/reportes?${RANGO}&deporte=caido`);
    await expect(
      page.getByRole('heading', { name: 'El servicio no está disponible, reintenta' }),
    ).toBeVisible();
    await expect(page.getByText('$15.200,00')).toHaveCount(0);

    await page.goto('/admin/reportes?desde=2026-12-31&hasta=2026-12-01');
    await expect(
      page.getByText('La fecha de fin debe ser igual o posterior a la de inicio.'),
    ).toBeVisible();

    await iniciarSesion(page, 'operador');
    await page.goto(`/admin/reportes?${RANGO}`);
    await expect(
      page.getByRole('heading', { name: 'No tienes permiso para ver esta sección' }),
    ).toBeVisible();
  });
});
