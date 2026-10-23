import { expect, test } from '@playwright/test';

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

test('evidence and configuration require an authenticated session', async ({
  request,
}) => {
  for (const path of ['/runs', '/runs/exh-1042', '/setup', '/workspace']) {
    expect((await request.get(`/api/v1${path}`)).status()).toBe(401);
  }
});

test('sample sessions are isolated, CSRF protected and revoked on logout', async ({
  request,
  browser,
  baseURL,
}) => {
  const response = await request.post('/api/v1/auth/demo', {
    data: {},
    headers: { Origin: baseURL! },
  });
  expect(response.ok()).toBe(true);
  const session = await response.json();
  expect(session.mode).toBe('demo');
  expect(session.csrfToken).toBeTruthy();
  expect((await request.get('/api/v1/runs')).ok()).toBe(true);

  const setup = {
    repository: 'example/storefront',
    stagingUrl: 'https://staging.example.com',
    testTenant: 'isolated-test-tenant',
    runbookRef:
      'agents/runbooks/checkout.yaml@0123456789abcdef0123456789abcdef01234567',
  };
  expect(
    (await request.put('/api/v1/setup', { data: setup })).status(),
  ).toBe(403);
  expect(
    (
      await request.put('/api/v1/setup', {
        data: setup,
        headers: {
          Origin: 'https://untrusted.example',
          'X-CSRF-Token': session.csrfToken,
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.put('/api/v1/setup', {
        data: setup,
        headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
      })
    ).ok(),
  ).toBe(true);
  expect(await (await request.get('/api/v1/setup')).json()).toMatchObject(setup);

  const other = await browser.newContext({ baseURL });
  try {
    expect(
      (
        await other.request.post('/api/v1/auth/demo', {
          data: {},
          headers: { Origin: baseURL! },
        })
      ).ok(),
    ).toBe(true);
    const otherSetup = await (await other.request.get('/api/v1/setup')).json();
    expect(otherSetup.repository).not.toBe(setup.repository);
  } finally {
    await other.close();
  }

  expect(
    (
      await request.post('/api/v1/auth/logout', {
        data: {},
        headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
      })
    ).ok(),
  ).toBe(true);
  expect((await request.get('/api/v1/runs')).status()).toBe(401);
});
