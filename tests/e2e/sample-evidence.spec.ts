import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const sourceSha = 'c6865b266b8799b96bdbcb39b586982e51f9bf6a';
async function sample(
  page: import('@playwright/test').Page,
  route = 'evidence/sample-project',
) {
  await page.goto(`/#/${route}`);
  await page.getByRole('button', { name: 'Explore workspace preview' }).click();
}

test('recorded sample plays real footage, preserves downloads, and exposes both attempts', async ({
  page,
}) => {
  await sample(page);
  await expect(
    page.getByRole('heading', { name: 'Checkout evidence, ready to inspect' }),
  ).toBeVisible();
  await expect(
    page.getByText('Provenance unverified', { exact: true }),
  ).toBeVisible();
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).duration))
    .toBeGreaterThan(0);
  await video.evaluate((v) => (v as HTMLVideoElement).play());
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('0.25');
  await expect(video).toHaveJSProperty('playbackRate', 0.25);
  await page
    .locator('.scenario-list')
    .getByRole('button', { name: /Payment declined/ })
    .click();
  await expect(video).toHaveAttribute(
    'aria-label',
    'Recording: Payment declined',
  );
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).duration))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Forward 0.1 seconds' }).click();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  const source = await video.getAttribute('src');
  const response = await page.request.get(source!);
  const expected = createHash('sha256')
    .update(await response.body())
    .digest('hex');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Original video', exact: true }).click();
  const download = await downloaded;
  expect(
    createHash('sha256')
      .update(await readFile((await download.path())!))
      .digest('hex'),
  ).toBe(expected);
  await expect(page.locator('.attempt-history')).toContainText(
    'Workflow failed',
  );
  await expect(page.locator('.attempt-history')).toContainText(
    'Workflow succeeded',
  );
  await page.reload();
  await expect(page.locator('video')).toHaveAttribute(
    'aria-label',
    'Recording: Payment declined',
  );
});

test('sample manifest and every original asset retain their source hashes', async ({
  request,
}) => {
  const response = await request.get('/samples/field-store/manifest.json');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    sample: true,
    headSha: sourceSha,
    pullRequest: 1,
    attempt: 2,
    origin: 'self_test',
  });
  expect(manifest.artifacts).toHaveLength(7);
  expect(manifest).not.toHaveProperty('verdict');
  for (const artifact of manifest.artifacts) {
    const response = await request.get(`/samples/field-store/${artifact.path}`);
    expect(response.ok(), artifact.path).toBe(true);
    const bytes = await response.body();
    expect(bytes.length).toBe(artifact.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      artifact.sha256,
    );
  }
});

test('artifact filters and full provenance remain available through direct links', async ({
  page,
}) => {
  await sample(page, 'evidence/sample-project?section=Artifacts');
  await expect(page.locator('.artifact-list li')).toHaveCount(7);
  await page.getByLabel('Filter artifacts').selectOption('Video');
  await expect(page.locator('.artifact-list li')).toHaveCount(3);
  await page.getByLabel('Filter artifacts').selectOption('Screenshot');
  await expect(page.locator('.artifact-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Provenance', exact: true }).click();
  await expect(page.locator('.sample-provenance')).toContainText(sourceSha);
  await expect(
    page.getByRole('link', { name: '40073771722 / 2' }),
  ).toHaveAttribute('href', /actions\/runs\/40073771722$/);
  await page.reload();
  await expect(page.locator('.sample-provenance')).toContainText(sourceSha);
});

test('nested sidebar actions work and attention filters survive search and reload', async ({
  page,
}) => {
  await sample(page, 'overview');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.locator('.nav-item')).toHaveCount(4);
  await nav
    .getByRole('button', { name: 'Collapse Agent setup', exact: true })
    .click();
  await expect(
    nav.getByRole('link', { name: 'Flow definitions', exact: true }),
  ).not.toBeVisible();
  await nav
    .getByRole('button', { name: 'Expand Agent setup', exact: true })
    .click();
  await expect(
    nav.getByRole('link', { name: 'Flow definitions', exact: true }),
  ).toBeVisible();
  await nav.getByRole('link', { name: 'Needs attention', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Search runs', { exact: true }).fill('expired');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL(/attention=1/);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Needs attention', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('mobile hierarchy opens sample evidence without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sample(page, 'overview');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Evidence explorer', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Checkout evidence, ready to inspect' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Artifacts', exact: false }).click();
  await expect(page.locator('.artifact-list li')).toHaveCount(7);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('unavailable video shows a useful error instead of a claimed successful playback', async ({
  page,
}) => {
  await page.route('**/samples/field-store/**/video.webm', (route) =>
    route.fulfill({ status: 404, body: 'Not found' }),
  );
  await sample(page);
  await expect(page.getByRole('alert')).toContainText(
    'This recording could not be loaded',
  );
  await expect(
    page.getByRole('link', {
      name: 'Download the original video',
      exact: true,
    }),
  ).toBeVisible();
});

test('API evidence shows actual negative responses, downloads, and separate capture provenance', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sample(page, 'evidence/sample-project?section=API');
  await expect(page.locator('.api-capture-summary')).toContainText(
    /supplemental local capture/i,
  );
  await expect(page.locator('.api-request-detail')).toContainText('HTTP 200');
  await page.getByRole('button', { name: /Reject declined payment/ }).click();
  await expect(page.locator('.api-request-detail')).toContainText('HTTP 402');
  await expect(page.getByLabel('Response body', { exact: true })).toContainText(
    'Sample payment declined',
  );
  await expect(page.getByLabel('cURL command', { exact: true })).toContainText(
    '--request POST',
  );
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('link', { name: 'declined.response.json', exact: true })
    .click();
  expect(
    JSON.parse(await readFile((await (await downloadEvent).path())!, 'utf8'))
      .error,
  ).toContain('payment declined');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const manifest = await (
    await request.get('/samples/field-store/api-evidence/manifest.json')
  ).json();
  expect(manifest).toMatchObject({
    headSha: sourceSha,
    origin: 'supplemental-local-curl',
    verification: 'unverified',
  });
  expect(manifest.calls).toHaveLength(11);
  for (const call of manifest.calls) {
    expect(call.httpStatus).toBe(call.expectedStatus);
    expect(call.curlExitCode).toBe(0);
    expect(call.checks.every((c: { passed: boolean }) => c.passed)).toBe(true);
    for (const file of call.files) {
      const response = await request.get(`/samples/field-store/${file.path}`);
      expect(response.ok()).toBe(true);
      const bytes = await response.body();
      expect(bytes.length).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        file.sha256,
      );
    }
  }
});

test('workspace labels stay concise without removing evidence qualification', async ({
  page,
}) => {
  await page.route('**/api/v1/runs*', async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/runs'))
      return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.runs[0].title = 'Sample: Saved-address checkout';
    await route.fulfill({ response, json: body });
  });
  await sample(page, 'runs');
  await expect(
    page.getByRole('link', { name: 'Saved-address checkout', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.sample-tag')).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Recording gallery', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Open report for PR 286', exact: true })
    .click();
  await expect(
    page.getByText('Illustrative review.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.notice').first()).toContainText(
    'Statuses and assertions are examples; no workspace execution is claimed.',
  );
});
