import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can login and add a product to the cart', async ({ page }) => {
    await page.goto('/p/g01-G01');

    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Fp%2Fg01-G01$/);

    await page.locator('input[placeholder="e.g. operations_admin"]').fill('renhua');
    await page.locator('input[type="password"]').fill('laowewanxiang');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/p\/g01-G01$/);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('button', { name: 'Added to cart' })).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByText('G01 · Catalog product')).toBeVisible();
  });
});
