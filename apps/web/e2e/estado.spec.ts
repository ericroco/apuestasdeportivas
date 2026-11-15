import { expect, test } from '@playwright/test';

// Spec 1, historia 1: con todo arriba, la página de estado muestra los tres componentes operativos.
test.describe('Página de estado del sistema', () => {
  test('muestra la web, la API y reportes operativos', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeVisible();
    for (const servicio of ['Web', 'API', 'Reportes']) {
      await expect(page.getByRole('listitem', { name: servicio })).toContainText('Operativo');
    }
    await expect(page.getByRole('status')).toHaveText('Todo operativo');
  });

  test('no tiene desplazamiento horizontal y el enlace de recarga es accesible por teclado', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(desborda).toBe(false);

    const enlace = page.getByRole('link', { name: 'Comprobar de nuevo' });
    await enlace.focus();
    await expect(enlace).toBeFocused();
  });
});
