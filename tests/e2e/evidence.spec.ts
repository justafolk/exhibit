import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  // Vite may become ready before Go finishes compiling.
  await expect
    .poll(async () => {
      try {
        return (await request.get('/api/healthz')).status();
      } catch {
        return 0;
      }
    })
    .toBe(200);
});
test('sample evidence is labelled and reports preserve limitations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('SAMPLE DATA', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('button', { name: 'Open report for PR 286' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('no real execution or recording');
  await expect(dialog).toContainText('Production payment processing');
  await expect(dialog).toContainText(
    '0000000000000000000000000000000000000412',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
test('status filters and search work together', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Verified', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Search runs' }).fill('empty states');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page
    .getByRole('textbox', { name: 'Search runs' })
    .fill('does-not-exist');
  await expect(page.getByText('No matching runs')).toBeVisible();
});
test('contract checks use the Go API and never claim execution', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Check a contract' }).click();
  await page.getByRole('button', { name: 'Evaluate contract' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Ready for policy review',
  );
  await page.getByLabel('Test tenant').fill('');
  await page.getByRole('button', { name: 'Evaluate contract' }).click();
  await expect(page.getByRole('status')).toContainText('Missing: testTenant');
  await page.getByLabel('Change type').selectOption('migration');
  await page.getByRole('button', { name: 'Evaluate contract' }).click();
  await expect(page.getByRole('status')).toContainText('Not testable');
});
test('empty real database has an honest onboarding state', async ({ page }) => {
  await page.route('**/api/v1/runs', (route) =>
    route.fulfill({ json: { mode: 'postgres', runs: [] } }),
  );
  await page.goto('/');
  await expect(page.getByText('Your evidence starts here')).toBeVisible();
  await expect(
    page.getByText('SAMPLE DATA', { exact: true }),
  ).not.toBeVisible();
});
test('API errors are actionable', async ({ page }) => {
  await page.route('**/api/v1/runs', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(
    'Evidence is unavailable',
  );
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
test('mobile layout fits the viewport and navigation works', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('tbody tr')).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Flow catalog', exact: true }).click();
  await expect(
    page.getByText('Checkout with a saved address', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Runbook', exact: true }).click();
  await expect(
    page.getByText('From a fresh clone to a running app'),
  ).toBeVisible();
});
