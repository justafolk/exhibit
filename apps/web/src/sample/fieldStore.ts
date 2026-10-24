// Curated projection of the immutable GitHub Actions sample artifact. See public/samples/field-store/README.md.
export const fieldStore = {
  repository: 'justafolk/sample-project-exhibit',
  headSha: 'c6865b266b8799b96bdbcb39b586982e51f9bf6a',
  pullRequest: 1,
  runId: 'sample-pr-40073771722',
  workflowRunId: 40073771722,
  artifactId: 12552751003,
  archiveSha256:
    'ddb25f5e1a752523ae5437728ab6ada5ed892f01c123de7b6bcf4c49906bf5ab',
  attempt: 2,
  startedAt: '2026-10-24T07:24:46.759Z',
  finishedAt: '2026-10-24T07:24:50.039Z',
  durationMs: 3280.4120000000003,
  notCovered: [
    'Secret-free sample PR browser tests only; no deployed staging or production was exercised',
    'Collector identity, artifact redaction and execution provenance are not independently verified',
  ],
  cleanup: {
    status: 'not_needed',
    details:
      'Sample-mode tests do not write customer staging data; process and runner cleanup are not independently verified',
  },
  assertions: [
    {
      id: 'browser-test-1',
      label:
        'Browser test: saved address checkout matches API and confirmation; cleanup is scoped ()',
      status: 'passed',
    },
    {
      id: 'browser-test-2',
      label: 'Browser test: payment-declined does not create an order ()',
      status: 'passed',
    },
    {
      id: 'browser-test-3',
      label: 'Browser test: out-of-stock does not create an order ()',
      status: 'passed',
    },
  ],
  artifacts: [
    {
      path: 'checkout-out-of-stock-does-not-create-an-order/trace.zip',
      sha256:
        'b18611e6b6480eae9f71cacc55824f1b4edce89eb8d700f77c0d21d60accbeac',
      bytes: 156071,
      mediaType: 'application/zip',
    },
    {
      path: 'checkout-out-of-stock-does-not-create-an-order/video.webm',
      sha256:
        'a764cb721c3f285ea536cf3b00d172ad4811fc7bbc53d0417e140d4444feff0c',
      bytes: 65936,
      mediaType: 'video/webm',
    },
    {
      path: 'checkout-payment-declined-does-not-create-an-order/trace.zip',
      sha256:
        'a03c9f5b555604ad9b64826ba065fc762dfb23c1d0283d8cf4179d86da796a49',
      bytes: 157399,
      mediaType: 'application/zip',
    },
    {
      path: 'checkout-payment-declined-does-not-create-an-order/video.webm',
      sha256:
        'bb6f00d4ff1dd090ef0762715c6b5c3254144bb7db9f48ee90ca354105a7e262',
      bytes: 66503,
      mediaType: 'video/webm',
    },
    {
      path: 'checkout-saved-address-che-b85c4-firmation-cleanup-is-scoped/confirmation.png',
      sha256:
        '235d3e99deadc1bb6f4ad9764e9ac7b9dfd7f97116d44df40b9a51ad94a18ba3',
      bytes: 72946,
      mediaType: 'image/png',
    },
    {
      path: 'checkout-saved-address-che-b85c4-firmation-cleanup-is-scoped/trace.zip',
      sha256:
        '2c016d5484dc14796b5161eb6f819d0d0e4db701483e240b2d70c30b3047fd26',
      bytes: 251294,
      mediaType: 'application/zip',
    },
    {
      path: 'checkout-saved-address-che-b85c4-firmation-cleanup-is-scoped/video.webm',
      sha256:
        '91649ad77d5c7e263c9bd41beae27701de3aab7b8d058c111deb34d4d5bf4ff7',
      bytes: 96242,
      mediaType: 'video/webm',
    },
  ],
  scenarios: [
    {
      id: 'saved-address',
      title: 'Saved-address checkout',
      description:
        'Confirms the saved address, $24 order total, API agreement, and run-scoped cleanup.',
      testTitle:
        'saved address checkout matches API and confirmation; cleanup is scoped',
      status: 'passed',
      testDurationMs: 756,
      videoDurationSeconds: 1.44,
      video:
        'checkout-saved-address-che-b85c4-firmation-cleanup-is-scoped/video.webm',
      trace:
        'checkout-saved-address-che-b85c4-firmation-cleanup-is-scoped/trace.zip',
      poster:
        'checkout-saved-address-che-b85c4-firmation-cleanup-is-scoped/preview.png',
      posterOrigin: 'Original confirmation screenshot',
    },
    {
      id: 'payment-declined',
      title: 'Payment declined',
      description:
        'Checks that the simulated decline is shown and no order is created.',
      testTitle: 'payment-declined does not create an order',
      status: 'passed',
      testDurationMs: 439,
      videoDurationSeconds: 1.28,
      video: 'checkout-payment-declined-does-not-create-an-order/video.webm',
      trace: 'checkout-payment-declined-does-not-create-an-order/trace.zip',
      poster: 'checkout-payment-declined-does-not-create-an-order/preview.png',
      posterOrigin: 'Preview frame extracted from the original video',
    },
    {
      id: 'out-of-stock',
      title: 'Out of stock',
      description:
        'Checks that the simulated inventory error is shown and no order is created.',
      testTitle: 'out-of-stock does not create an order',
      status: 'passed',
      testDurationMs: 404,
      videoDurationSeconds: 1.2,
      video: 'checkout-out-of-stock-does-not-create-an-order/video.webm',
      trace: 'checkout-out-of-stock-does-not-create-an-order/trace.zip',
      poster: 'checkout-out-of-stock-does-not-create-an-order/preview.png',
      posterOrigin: 'Preview frame extracted from the original video',
    },
  ],
  attempts: [
    {
      attempt: 1,
      conclusion: 'failure',
      startedAt: '2026-10-24T07:20:51Z',
      url: 'https://github.com/justafolk/sample-project-exhibit/actions/runs/40073771722/attempts/1',
    },
    {
      attempt: 2,
      conclusion: 'success',
      startedAt: '2026-10-24T07:23:53Z',
      url: 'https://github.com/justafolk/sample-project-exhibit/actions/runs/40073771722/attempts/2',
    },
  ],
} as const;
export const sampleAsset = (path: string) => `/samples/field-store/${path}`;
export const sampleWorkflowURL = `https://github.com/${fieldStore.repository}/actions/runs/${fieldStore.workflowRunId}`;
