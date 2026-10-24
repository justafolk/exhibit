// Invoked by the PostgreSQL integration suite when EXHIBIT_CI_BROWSER_TEST=1.
// The server, workspace, session and original video are real disposable test data.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.EXHIBIT_TEST_URL;
const run = process.env.EXHIBIT_TEST_RUN;
const browser = await chromium.launch({
  executablePath: process.env.SAMPLE_CHROMIUM_PATH || undefined,
});
try {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'exhibit_session',
      value: process.env.EXHIBIT_TEST_SESSION,
      url: base + '/api/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  const page = await context.newPage();
  await page.goto(base + '/#/runs/' + run);
  await page
    .getByRole('heading', { name: 'GitHub Actions evidence', exact: true })
    .waitFor();
  await page.getByText('Check keyboard navigation', { exact: true }).waitFor();
  await page.getByText('API order', { exact: true }).waitFor();
  await page.getByText('Skipped', { exact: true }).waitFor();
  const video = page.locator('video').first();
  await video.evaluate((element) => {
    element.muted = true;
    return element.play();
  });
  await page.waitForFunction(
    () => document.querySelector('video')?.currentTime > 0,
  );
  assert.ok(await video.evaluate((element) => element.videoWidth > 0));
  await page
    .getByRole('link', {
      name: 'Workflow jobs, steps and outputs',
      exact: true,
    })
    .count();
  await page
    .getByText('Workflow jobs, steps and outputs', { exact: true })
    .click();
  assert.match(await page.locator('.ci-json').last().innerText(), /success/);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'report.html', exact: true }).click();
  assert.equal((await download).suggestedFilename(), 'report.html');
  await page.goto(base + '/#/studio');
  await page
    .getByRole('heading', { name: 'Workspace recordings', exact: true })
    .waitFor();
  await page
    .getByRole('link', { name: 'Open evidence report', exact: true })
    .waitFor();
  assert.equal(await page.locator('video').count(), 1);
  assert.equal(
    await page.getByText('Curated CI snapshot', { exact: true }).count(),
    0,
  );
  await page.goto(base + '/#/settings');
  await page
    .getByRole('heading', { name: 'GitHub Actions uploads', exact: true })
    .waitFor();
  await page
    .getByLabel('GitHub repository', { exact: true })
    .fill('acme/browser-upload');
  await page
    .getByRole('button', { name: 'Create upload token', exact: true })
    .click();
  const secret = page.getByLabel('New ingestion token', { exact: true });
  await secret.waitFor();
  assert.equal((await secret.inputValue()).length, 64);
  await page.getByRole('button', { name: 'Hide token', exact: true }).click();
  assert.equal(await secret.count(), 0);
  console.log(
    'PostgreSQL dashboard browser check passed: actual saved video playback, reports, downloads, captures and token creation.',
  );
} finally {
  await browser.close();
}
