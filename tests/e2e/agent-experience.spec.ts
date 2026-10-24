import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function sample(
  page: import('@playwright/test').Page,
  route = 'overview',
) {
  await page.goto(`/#/${route}`);
  await page.getByRole('button', { name: 'Explore sample workspace' }).click();
}

test('review is the default and configuration is progressive', async ({
  page,
}) => {
  await sample(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.locator('.nav-item')).toHaveCount(4);
  await expect(
    page.getByRole('heading', { name: 'Less setup. More proof.' }),
  ).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page
    .getByRole('link', { name: 'Give your agent the instructions' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Give your agent the recording step' }),
  ).toBeVisible();
  await expect(
    page
      .locator('main details.advanced-tools')
      .getByRole('link', { name: /Contract inspector/ }),
  ).not.toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download instructions' }).click();
  const text = await readFile((await (await download).path())!, 'utf8');
  expect(text).toContain('npm run evidence:record');
  expect(text).toContain('does not run customer staging flows');
  await page
    .getByText('Advanced workspace configuration', { exact: true })
    .click();
  await page
    .locator('main details.advanced-tools')
    .getByRole('link', { name: /Contract inspector/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Prepare evidence', exact: true }),
  ).toBeVisible();
});

test('agent recording page never implies a hosted run and manual capture is opt-in', async ({
  page,
}) => {
  await sample(page, 'studio');
  await expect(
    page.getByRole('heading', { name: 'Agent recordings', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your workspace captures' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record screen', exact: true }),
  ).toHaveCount(0);
  const before = await (await page.request.get('/api/v1/recordings')).json();
  await page
    .getByText('Manual recording tools · optional', { exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Record screen', exact: true }),
  ).toBeVisible();
  await page
    .getByText('Manual recording tools · optional', { exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Record screen', exact: true }),
  ).toHaveCount(0);
  expect(await (await page.request.get('/api/v1/recordings')).json()).toEqual(
    before,
  );
});
