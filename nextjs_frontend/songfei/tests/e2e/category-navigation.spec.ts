import { expect, test } from '@playwright/test';

test('leaf category pages display products assigned to that category', async ({ page }) => {
  await page.goto('/cat/test_sub');

  await expect(page.getByRole('link', { name: 'test_subsub' })).toBeVisible();
  await page.getByRole('link', { name: 'test_subsub' }).click();

  await expect(page).toHaveURL(/\/cat\/test_subsub$/);
  await expect(page.getByText('G01')).toBeVisible();
  await expect(page.locator('a[href="/p/g01-G01"]')).toBeVisible();
});