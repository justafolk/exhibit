import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// A synthetic, clearly labelled clip exercises real WebM decoding and byte integrity.
// It is test input, never proof of customer execution or a real screen-sharing session.
async function sampleClip(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d')!;
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    let frame = 0;
    const paint = () => {
      context.fillStyle = '#f4f6fb';
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = '#2458d3';
      context.fillRect(35, 35, 12 + (frame++ % 50), 12);
      context.fillStyle = '#171c26';
      context.font = '24px sans-serif';
      context.fillText('Exhibit synthetic test clip', 35, 100);
      context.font = '16px sans-serif';
      context.fillText('Sample input · not customer evidence', 35, 140);
    };
    paint();
    const timer = window.setInterval(paint, 80);
    return await new Promise<number[]>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('Could not create test clip'));
      recorder.onstop = async () => {
        window.clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
        );
      };
      recorder.start();
      window.setTimeout(() => recorder.stop(), 900);
    });
  });
  return Buffer.from(bytes);
}

async function studio(page: Page) {
  await page.goto('/#/studio');
  await page.getByRole('button', { name: 'Explore workspace preview' }).click();
  await page
    .getByText('Manual recording tools · optional', { exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Recording studio', exact: true }),
  ).toBeVisible();
}

async function importClip(page: Page, buffer: Buffer) {
  await page.getByLabel('Import video', { exact: true }).setInputFiles({
    name: 'synthetic-sample.webm',
    mimeType: 'video/webm',
    buffer,
  });
  await expect(page.locator('video')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download original', exact: true }),
  ).toBeEnabled();
}

test('recording presentation preserves original bytes and saves only unverified metadata', async ({
  page,
}) => {
  await studio(page);
  const bytes = await sampleClip(page);
  const digest = createHash('sha256').update(bytes).digest('hex');
  let metadataPosts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/api/v1/recordings')
    )
      metadataPosts++;
  });
  await importClip(page, bytes);
  await page
    .getByLabel('Recording name', { exact: true })
    .fill('Checkout walkthrough');
  await page.getByLabel('Chapter label', { exact: true }).fill('Opening state');
  await page.getByRole('button', { name: 'Add chapter', exact: true }).click();
  await page.getByLabel('Frame style', { exact: true }).selectOption('mist');
  await page.getByLabel('Playback speed', { exact: true }).selectOption('1.5');
  await page
    .getByRole('slider', { name: 'Focus zoom', exact: true })
    .press('End');
  expect(metadataPosts).toBe(0);

  const originalEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download original', exact: true })
    .click();
  const original = await originalEvent;
  expect(
    createHash('sha256')
      .update(await readFile((await original.path())!))
      .digest('hex'),
  ).toBe(digest);

  const manifestEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download manifest', exact: true })
    .click();
  const manifest = JSON.parse(
    await readFile((await (await manifestEvent).path())!, 'utf8'),
  );
  expect(manifest).toMatchObject({
    sha256: digest,
    bytes: bytes.length,
    origin: 'manual',
    verification: 'unverified',
    mediaStored: false,
    chapters: [{ label: 'Opening state', atSeconds: 0 }],
    presentation: { frame: 'mist', zoom: 2, playbackRate: 1.5 },
  });
  const before = await (await page.request.get('/api/v1/runs')).json();
  await page
    .getByRole('button', { name: 'Save metadata', exact: true })
    .click();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/v1/recordings');
      return (await response.json()).recordings?.some(
        (recording: { name: string }) =>
          recording.name === 'Checkout walkthrough',
      );
    })
    .toBe(true);
  expect(metadataPosts).toBe(1);
  expect(await (await page.request.get('/api/v1/runs')).json()).toEqual(before);
  await page.reload();
  await page
    .getByText('Manual recording tools · optional', { exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Download manifest for Checkout walkthrough',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
});

test('invalid imports and failed metadata saves preserve usable local media', async ({
  page,
}) => {
  await studio(page);
  const bytes = await sampleClip(page);
  await importClip(page, bytes);
  const originalURL = await page.locator('video').getAttribute('src');
  await page.getByLabel('Import video', { exact: true }).setInputFiles({
    name: 'corrupt.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from('not a video'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('video')).toHaveAttribute('src', originalURL!);
  await page.route('**/api/v1/recordings', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 503,
        json: { error: 'Metadata temporarily unavailable' },
      });
    else await route.continue();
  });
  await page
    .getByLabel('Recording name', { exact: true })
    .fill('Keep this local recording');
  await page
    .getByRole('button', { name: 'Save metadata', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Metadata temporarily unavailable',
  );
  await expect(page.getByLabel('Recording name', { exact: true })).toHaveValue(
    'Keep this local recording',
  );
  await expect(page.locator('video')).toHaveAttribute('src', originalURL!);
  await expect(
    page.getByRole('button', { name: 'Save metadata', exact: true }),
  ).toBeEnabled();
});

test('cancelled screen sharing remains retryable and never saves a recording', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        throw new DOMException('User cancelled sharing', 'NotAllowedError');
      },
    });
  });
  await studio(page);
  await page
    .getByRole('button', { name: 'Record screen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record screen', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('video')).toHaveCount(0);
  expect(
    (await (await page.request.get('/api/v1/recordings')).json()).recordings,
  ).toEqual([]);
});

test('screen recorder produces playable local bytes and releases shared tracks', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d')!;
        const stream = canvas.captureStream(12);
        Object.assign(window, {
          __exhibitTestTracks: stream.getTracks(),
          __exhibitTestFrames: 0,
        });
        const paint = () => {
          context.fillStyle = '#f4f6fb';
          context.fillRect(0, 0, 640, 360);
          context.fillStyle = '#171c26';
          context.font = '24px sans-serif';
          context.fillText('Synthetic screen-sharing test', 30, 100);
          const state = window as unknown as { __exhibitTestFrames: number };
          state.__exhibitTestFrames++;
        };
        paint();
        const timer = window.setInterval(() => {
          if (stream.getTracks().every((track) => track.readyState === 'ended'))
            window.clearInterval(timer);
          else paint();
        }, 80);
        return stream;
      },
    });
  });
  await studio(page);
  await page
    .getByRole('button', { name: 'Record screen', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Stop recording', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __exhibitTestFrames: number })
            .__exhibitTestFrames,
      ),
    )
    .toBeGreaterThan(6);
  // Simulate a delayed stop callback: elapsed wall time must not become media duration.
  await page.evaluate(() => {
    const now = performance.now.bind(performance);
    performance.now = () => now() + 60_000;
  });
  await page
    .getByRole('button', { name: 'Stop recording', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download original', exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __exhibitTestTracks: MediaStreamTrack[] }
        ).__exhibitTestTracks.every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
  const manifestEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download manifest', exact: true })
    .click();
  const manifest = JSON.parse(
    await readFile((await (await manifestEvent).path())!, 'utf8'),
  );
  expect(manifest.durationSeconds).toBeGreaterThan(0);
  expect(manifest.durationSeconds).toBeLessThan(10);
  await expect(page.locator('video')).toBeVisible();
  await page
    .getByRole('button', { name: 'Record screen', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Stop recording', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Reviews', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __exhibitTestTracks: MediaStreamTrack[] }
        ).__exhibitTestTracks.every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
});

test('a delayed recording list preserves newly saved metadata', async ({
  page,
}) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/api/v1/recordings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    requested();
    await delayed;
    await route.fulfill({ response });
  });
  await studio(page);
  await started;
  await importClip(page, await sampleClip(page));
  await page
    .getByLabel('Recording name', { exact: true })
    .fill('Saved during loading');
  await page
    .getByRole('button', { name: 'Save metadata', exact: true })
    .click();
  const saved = page.getByRole('button', {
    name: 'Download manifest for Saved during loading',
    exact: true,
  });
  await expect(saved).toBeVisible();
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/recordings') &&
      response.request().method() === 'GET',
  );
  release();
  await response;
  await expect(
    page.getByText('No recording metadata has been saved.', { exact: false }),
  ).toHaveCount(0);
  await expect(saved).toBeVisible();
});
