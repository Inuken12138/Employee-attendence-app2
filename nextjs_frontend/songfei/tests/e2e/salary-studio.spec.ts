import { expect, test } from '@playwright/test';

test('salary studio integrates the five payroll views for the smoke month', async ({ page }) => {
  await page.goto('/erp/salary');

  await expect(page.getByRole('heading', { name: 'Five views, one payroll room.' })).toBeVisible();

  const periodCard = page.locator('.salary-studio-period-card');
  await periodCard.locator('input[type="number"]').fill('2026');
  await periodCard.locator('select').selectOption('11');

  await expect(page.getByText(/Work through November 2026 in the same place/i)).toBeVisible();

  await page.getByRole('button', { name: /^Attendance/ }).click();
  await expect(page.getByRole('heading', { name: 'Resolve the month before payroll can move.' })).toBeVisible();
  await expect(page.locator('iframe[title="Attendance workspace"]')).toHaveAttribute('src', /year=2026&month=11/);

  await page.getByRole('button', { name: /^Adjustments/ }).click();
  await expect(page.getByRole('heading', { name: 'Version, preview, activate, and archive the rulebook.' })).toBeVisible();
  await expect(page.getByText('Carry-forward ledger')).toBeVisible();
  await expect(page.getByText(/100,000 LAK/).first()).toBeVisible();

  await page.getByRole('button', { name: /^Projects/ }).click();
  await expect(page.getByRole('heading', { name: 'Open a project, then tally work day by day.' })).toBeVisible();
  await expect(page.getByText(/Smoke Project/).first()).toBeVisible();
  await expect(page.getByText(/November 2026 tally sheet/i)).toBeVisible();

  await page.getByRole('button', { name: /^Final Payroll/ }).click();
  await expect(page.getByRole('heading', { name: 'Generate, review, lock, and correct the month.' })).toBeVisible();
  await expect(page.getByText(/Correction payroll run #|Monthly payroll run #/).first()).toBeVisible();
  await expect(page.locator('.salary-studio-run-detail').getByText('Carry-forward recovery').first()).toBeVisible();

  await page.getByRole('button', { name: /^Reports/ }).click();
  await expect(page.getByRole('heading', { name: 'Track workforce cost across recent locked months.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Workforce cost trend chart' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Preview the management report in-browser before export.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inspect the employee-facing report before export.' })).toBeVisible();

  const runSelect = page.getByRole('combobox', { name: 'Run' });
  const normalRunValue = await runSelect.locator('option').evaluateAll((options) => {
    const match = options.find((option) => option.textContent?.includes('normal #'));
    return match?.getAttribute('value') || '';
  });

  expect(normalRunValue).not.toBe('');
  await runSelect.selectOption(normalRunValue);
  await expect(page.getByRole('link', { name: /Workforce report/i }).first()).toBeVisible();
});