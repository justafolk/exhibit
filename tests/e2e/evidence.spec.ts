import { test, expect, type Page } from '@playwright/test';

async function openSample(page: Page, route = 'runs') {
  await page.goto(`/#/${route}`);
  await page.getByRole('button', { name: 'Explore sample workspace' }).click();
  await expect(page.getByText('SAMPLE DATA', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ request }) => {
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

test('sample reports preserve source commit and coverage limitations', async ({
  page,
}) => {
  await openSample(page);
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('link', { name: 'Open report for PR 286' }).click();
  await expect(page).toHaveURL(/#\/runs\/exh-1042/);
  await expect(page.getByText('Sample report.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Production payment processing', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('0000000000000000000000000000000000000412', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Run provenance' }),
  ).toBeVisible();
});

test('status filters and search work together', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Verified', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Search runs' }).fill('empty states');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page
    .getByRole('textbox', { name: 'Search runs' })
    .fill('does-not-exist');
  await expect(page.getByText('No matching runs')).toBeVisible();
});

test('workspace setup saves through the API and survives reload', async ({
  page,
}) => {
  await openSample(page, 'setup');
  await page.getByLabel('Repository', { exact: true }).fill('acme/storefront');
  await page
    .getByLabel('Staging URL', { exact: true })
    .fill('https://staging.example.com');
  await page
    .getByLabel('Test tenant reference', { exact: true })
    .fill('review-test-tenant');
  await page
    .getByLabel('Versioned runbook reference', { exact: true })
    .fill(
      'agents/runbooks/checkout.yaml@0123456789abcdef0123456789abcdef01234567',
    );
  await page.getByRole('button', { name: 'Save workspace details' }).click();
  await expect(page.getByRole('status')).toContainText(
    'saved for this session',
  );
  await page.reload();
  await expect(page.getByLabel('Repository', { exact: true })).toHaveValue(
    'acme/storefront',
  );
  await expect(
    page.getByLabel('Test tenant reference', { exact: true }),
  ).toHaveValue('review-test-tenant');
});

test('empty workspace has an honest onboarding state', async ({ page }) => {
  await page.route('**/api/v1/runs', (route) =>
    route.fulfill({ json: { mode: 'demo', runs: [] } }),
  );
  await openSample(page, 'overview');
  await expect(page.getByText('Your evidence starts here')).toBeVisible();
});

test('API errors are actionable and never fall back to fixtures', async ({
  page,
}) => {
  await page.route('**/api/v1/runs', (route) =>
    route.fulfill({ status: 503, json: { error: 'Evidence is unavailable' } }),
  );
  await openSample(page);
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(0);
});

test('mobile navigation and logout are usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSample(page);
  await expect(page.locator('tbody tr')).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Flow catalog', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Flow catalog', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
});
