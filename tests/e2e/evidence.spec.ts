import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
  await expect(page).toHaveURL(/status=verified/);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Search runs' })).toHaveValue(
    'empty states',
  );
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page
    .getByRole('textbox', { name: 'Search runs' })
    .fill('does-not-exist');
  await expect(page.getByText('No matching runs')).toBeVisible();
});

test('portable reports preserve full provenance and sample qualification', async ({
  page,
}) => {
  await openSample(page);
  await page.getByRole('link', { name: 'Open report for PR 286' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('exhibit-exh-1042.md');
  const report = await readFile((await download.path())!, 'utf8');
  expect(report).toContain('SAMPLE');
  expect(report).toContain('0000000000000000000000000000000000000412');
  expect(report).toContain('Production payment processing');
  expect(report).toContain('acme/storefront');
});

test('revoked sessions return the browser to sign-in', async ({
  page,
  baseURL,
}) => {
  await openSample(page);
  await expect(
    page.getByRole('button', { name: 'Refresh runs' }),
  ).toBeEnabled();
  const session = await (await page.request.get('/api/v1/auth/session')).json();
  expect(
    (
      await page.request.post('/api/v1/auth/logout', {
        data: {},
        headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole('button', { name: 'Refresh runs' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('session has expired');
  await expect(page.locator('tbody tr')).toHaveCount(0);
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

test('invalid report links show a recoverable error', async ({ page }) => {
  await openSample(page, 'runs/%');
  await expect(
    page.getByRole('heading', { name: 'Report unavailable' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Reviews', exact: true })
    .click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
});

test('owners can rename their workspace', async ({ page }) => {
  await openSample(page, 'settings');
  await page
    .getByLabel('Workspace name', { exact: true })
    .fill('Review studio');
  await page
    .getByRole('button', { name: 'Save workspace name', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Workspace name saved.');
  await page.reload();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue(
    'Review studio',
  );
  expect(
    (await (await page.request.get('/api/v1/auth/session')).json()).workspace
      .name,
  ).toBe('Review studio');
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
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Agent setup', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Give your agent the recording step',
      exact: true,
    }),
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

test('flow definitions and contract drafts persist without authorizing execution', async ({
  page,
}) => {
  await openSample(page, 'flows');
  await page.getByRole('button', { name: 'Create flow', exact: true }).click();
  await page
    .getByLabel('Flow name', { exact: true })
    .fill('Saved-address review');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Review one saved-address checkout.');
  await page
    .getByLabel('Preconditions', { exact: true })
    .fill('Dedicated test tenant\nSaved address exists');
  await page
    .getByLabel('Deterministic assertions', { exact: true })
    .fill('Saved address is selected\nOrder total matches');
  await page
    .getByLabel('Cleanup instructions', { exact: true })
    .fill('Remove only records tagged with the run ID.');
  const runbook =
    'agents/runbooks/checkout.yaml@0123456789abcdef0123456789abcdef01234567';
  await page
    .getByLabel('Versioned runbook reference', { exact: true })
    .fill(runbook);
  await page.getByRole('button', { name: 'Save flow', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Edit Saved-address review',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Edit Saved-address review', exact: true })
    .click();
  await expect(page.getByLabel('Preconditions', { exact: true })).toHaveValue(
    'Dedicated test tenant\nSaved address exists',
  );
  await page.keyboard.press('Escape');
  await page.goto('/#/agents');
  await page
    .getByText('Advanced workspace configuration', { exact: true })
    .click();
  await page.getByRole('link', { name: /Contract inspector/ }).click();
  await page.getByLabel('Repository', { exact: true }).fill('acme/storefront');
  await page.getByLabel('Pull request number', { exact: true }).fill('286');
  await page
    .getByLabel('Head commit SHA', { exact: true })
    .fill('0123456789abcdef0123456789abcdef01234567');
  await page
    .getByLabel('Change type', { exact: true })
    .selectOption('frontend');
  await page.getByRole('checkbox', { name: /Saved-address review/ }).check();
  await page
    .getByLabel('Versioned runbook reference', { exact: true })
    .fill(runbook);
  await page
    .getByLabel('Test tenant reference', { exact: true })
    .fill('checkout-review-tenant');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/v1/contract-draft')).json())
          .testTenant,
    )
    .toBe('checkout-review-tenant');
  await page.reload();
  await expect(
    page.getByLabel('Pull request number', { exact: true }),
  ).toHaveValue('286');
  await expect(
    page.getByRole('checkbox', { name: /Saved-address review/ }),
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Evaluate contract', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Ready for policy review',
  );
  await page.getByLabel('Test tenant reference', { exact: true }).fill('');
  await page
    .getByRole('button', { name: 'Evaluate contract', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('testTenant');
  await page
    .getByLabel('Change type', { exact: true })
    .selectOption('migration');
  await page
    .getByRole('button', { name: 'Evaluate contract', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Not testable');
  const runs = await (await page.request.get('/api/v1/runs')).json();
  expect(runs.runs).toHaveLength(5);
  expect(runs.runs.every((run: { sample: boolean }) => run.sample)).toBe(true);
});
