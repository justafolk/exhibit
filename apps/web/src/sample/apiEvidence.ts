export const apiEvidence = {
  schemaVersion: 1,
  sample: true,
  verification: 'unverified',
  origin: 'supplemental-local-curl',
  repository: 'justafolk/sample-project-exhibit',
  headSha: 'c6865b266b8799b96bdbcb39b586982e51f9bf6a',
  startedAt: '2026-10-24T10:03:19.405481+00:00',
  finishedAt: '2026-10-24T10:03:19.535111+00:00',
  baseURL: 'http://127.0.0.1:4175',
  serverVersion: {
    sample: true,
    headSha: 'c6865b266b8799b96bdbcb39b586982e51f9bf6a',
    commitAvailable: true,
  },
  scopeNote:
    'Related sample checkout endpoints. This source PR changed workflow/configuration files, not API implementation. These requests are a supplemental local capture, separate from the original CI artifact.',
  calls: [
    {
      id: 'seed-checkout',
      title: 'Prepare checkout',
      method: 'POST',
      path: '/api/seed',
      url: 'http://127.0.0.1:4175/api/seed?runId=curl-evidence-8b3f76b1-checkout',
      phase: 'setup',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request POST 'http://127.0.0.1:4175/api/seed?runId=curl-evidence-8b3f76b1-checkout'",
      requestBody: null,
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 1.925,
      capturedAt: '2026-10-24T10:03:19.418164+00:00',
      responseBody: {
        runId: 'curl-evidence-8b3f76b1-checkout',
        address: {
          id: 'saved-home',
          label: 'Sample home',
          street: '42 Example Lane',
          city: 'Testville',
        },
        sample: true,
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'Saved address is available',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/seed-checkout.request.txt',
          bytes: 157,
          sha256:
            'ab3310fb3ea514610392207051925ad1485120ed75389d292f52a927384f919f',
        },
        {
          path: 'api-evidence/seed-checkout.response.json',
          bytes: 155,
          sha256:
            '05315350e067e7dae40b114bf941e46617ee09dc747713f5b6c814fc41b90751',
        },
        {
          path: 'api-evidence/seed-checkout.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
    {
      id: 'create-order',
      title: 'Create an order',
      method: 'POST',
      path: '/api/checkout',
      url: 'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-checkout',
      phase: 'exercise',
      command:
        'curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request POST \'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-checkout\' --header \'Content-Type: application/json\' --data-raw \'{"scenario": "happy", "addressId": "saved-home"}\'',
      requestBody: '{"scenario": "happy", "addressId": "saved-home"}',
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 2.868,
      capturedAt: '2026-10-24T10:03:19.432906+00:00',
      responseBody: {
        order: {
          id: 'order-curl-evidence-8b3f76b1-checkout',
          runId: 'curl-evidence-8b3f76b1-checkout',
          addressId: 'saved-home',
          totalCents: 2400,
          currency: 'USD',
        },
        sample: true,
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'Order total and saved address match',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/create-order.request.txt',
          bytes: 265,
          sha256:
            '2b0cdc9d6fee5cb4b7e6dee816a0faca8afce26c1c1661843116a706f3d06ba3',
        },
        {
          path: 'api-evidence/create-order.response.json',
          bytes: 172,
          sha256:
            '552a8124789af06e3d8f0f9fb3659b5df3ada1b4a49bc1065dbde2f4612c3928',
        },
        {
          path: 'api-evidence/create-order.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
    {
      id: 'read-order',
      title: 'Read the created order',
      method: 'GET',
      path: '/api/order',
      url: 'http://127.0.0.1:4175/api/order?runId=curl-evidence-8b3f76b1-checkout',
      phase: 'exercise',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request GET 'http://127.0.0.1:4175/api/order?runId=curl-evidence-8b3f76b1-checkout'",
      requestBody: null,
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 1.232,
      capturedAt: '2026-10-24T10:03:19.445879+00:00',
      responseBody: {
        order: {
          id: 'order-curl-evidence-8b3f76b1-checkout',
          runId: 'curl-evidence-8b3f76b1-checkout',
          addressId: 'saved-home',
          totalCents: 2400,
          currency: 'USD',
        },
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'Created order persists',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/read-order.request.txt',
          bytes: 157,
          sha256:
            '34f780c144760478e5f1ca5a452e3a1fa85be4fd05a04774f335a4fe3319b65b',
        },
        {
          path: 'api-evidence/read-order.response.json',
          bytes: 158,
          sha256:
            'd1942f63478cee77a9e480aa85268649430943f65b5013c5c9d75189b309298e',
        },
        {
          path: 'api-evidence/read-order.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
    {
      id: 'invalid-json',
      title: 'Reject invalid JSON',
      method: 'POST',
      path: '/api/checkout',
      url: 'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-checkout',
      phase: 'exercise',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request POST 'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-checkout' --header 'Content-Type: application/json' --data-raw '{broken'",
      requestBody: '{broken',
      httpStatus: 400,
      expectedStatus: 400,
      curlExitCode: 0,
      elapsedMs: 3.035,
      capturedAt: '2026-10-24T10:03:19.455121+00:00',
      responseBody: {
        error: 'Invalid JSON',
      },
      responseHeaders:
        'HTTP/1.1 400 Bad Request\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 400',
          passed: true,
        },
        {
          label: 'Invalid JSON is rejected',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/invalid-json.request.txt',
          bytes: 224,
          sha256:
            '7fd9ff0999858e8853cbcf3c938f16355a19aff3c3c4233730bd02cc200b8e0f',
        },
        {
          path: 'api-evidence/invalid-json.response.json',
          bytes: 24,
          sha256:
            '03fc664450aa8f4838fc0f0ab9528c42af38e3dd9a3d3d681d8fb10a8c92329e',
        },
        {
          path: 'api-evidence/invalid-json.headers.txt',
          bytes: 197,
          sha256:
            '00dd364d61bfa27970bf585d58d9ff0b4b58e81eb4828f11d5e973415b52f966',
        },
      ],
    },
    {
      id: 'seed-errors',
      title: 'Prepare negative scenarios',
      method: 'POST',
      path: '/api/seed',
      url: 'http://127.0.0.1:4175/api/seed?runId=curl-evidence-8b3f76b1-errors',
      phase: 'setup',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request POST 'http://127.0.0.1:4175/api/seed?runId=curl-evidence-8b3f76b1-errors'",
      requestBody: null,
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 1.142,
      capturedAt: '2026-10-24T10:03:19.466629+00:00',
      responseBody: {
        runId: 'curl-evidence-8b3f76b1-errors',
        address: {
          id: 'saved-home',
          label: 'Sample home',
          street: '42 Example Lane',
          city: 'Testville',
        },
        sample: true,
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'Synthetic sample run created',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/seed-errors.request.txt',
          bytes: 155,
          sha256:
            'c7e165c2d600b80d57166658e2f576f742e66d8cf3dcec09db3d520fa272b360',
        },
        {
          path: 'api-evidence/seed-errors.response.json',
          bytes: 153,
          sha256:
            'a2e37a08de25326b097e57469e177656ccd9e240c64a8fcc5800342d735cb929',
        },
        {
          path: 'api-evidence/seed-errors.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
    {
      id: 'declined',
      title: 'Reject declined payment',
      method: 'POST',
      path: '/api/checkout',
      url: 'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-errors',
      phase: 'exercise',
      command:
        'curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request POST \'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-errors\' --header \'Content-Type: application/json\' --data-raw \'{"scenario": "payment-declined", "addressId": "saved-home"}\'',
      requestBody:
        '{"scenario": "payment-declined", "addressId": "saved-home"}',
      httpStatus: 402,
      expectedStatus: 402,
      curlExitCode: 0,
      elapsedMs: 1.428,
      capturedAt: '2026-10-24T10:03:19.475994+00:00',
      responseBody: {
        error: 'Sample payment declined; no order created',
      },
      responseHeaders:
        'HTTP/1.1 402 Payment Required\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 402',
          passed: true,
        },
        {
          label: 'Payment error matches',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/declined.request.txt',
          bytes: 274,
          sha256:
            'a07bc676b3a39f0522442a8c560c53063d57b6163b2fbf771bf6029a9d8211b5',
        },
        {
          path: 'api-evidence/declined.response.json',
          bytes: 53,
          sha256:
            '26c8898ee22a692830f8c2a28f134d1e950893e096e547bbb0b5e5818b7564e4',
        },
        {
          path: 'api-evidence/declined.headers.txt',
          bytes: 202,
          sha256:
            '12d3ab31661551b96a4edc6b23c829e172d8280b330866e43b6de0f73d17fe5a',
        },
      ],
    },
    {
      id: 'declined-no-order',
      title: 'Confirm declined payment creates no order',
      method: 'GET',
      path: '/api/order',
      url: 'http://127.0.0.1:4175/api/order?runId=curl-evidence-8b3f76b1-errors',
      phase: 'exercise',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request GET 'http://127.0.0.1:4175/api/order?runId=curl-evidence-8b3f76b1-errors'",
      requestBody: null,
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 1.259,
      capturedAt: '2026-10-24T10:03:19.486053+00:00',
      responseBody: {
        order: null,
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'No order exists',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/declined-no-order.request.txt',
          bytes: 155,
          sha256:
            '4cae05eeea1b4fbfd3517a7899a200ce03503d0a0b39e670fafced6d7555cc18',
        },
        {
          path: 'api-evidence/declined-no-order.response.json',
          bytes: 14,
          sha256:
            'c8102108d1bb134ebcad39091412d5aeeb89cf96abb748c57253b33bcf89126b',
        },
        {
          path: 'api-evidence/declined-no-order.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
    {
      id: 'out-of-stock',
      title: 'Reject unavailable stock',
      method: 'POST',
      path: '/api/checkout',
      url: 'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-errors',
      phase: 'exercise',
      command:
        'curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request POST \'http://127.0.0.1:4175/api/checkout?runId=curl-evidence-8b3f76b1-errors\' --header \'Content-Type: application/json\' --data-raw \'{"scenario": "out-of-stock", "addressId": "saved-home"}\'',
      requestBody: '{"scenario": "out-of-stock", "addressId": "saved-home"}',
      httpStatus: 409,
      expectedStatus: 409,
      curlExitCode: 0,
      elapsedMs: 1.863,
      capturedAt: '2026-10-24T10:03:19.495233+00:00',
      responseBody: {
        error: 'Sample item out of stock; no order created',
      },
      responseHeaders:
        'HTTP/1.1 409 Conflict\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 409',
          passed: true,
        },
        {
          label: 'Stock error matches',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/out-of-stock.request.txt',
          bytes: 270,
          sha256:
            '59ef11c91996b98924c3c9c98547c2bed88db65cefa5c44cb39947f3f9d41de6',
        },
        {
          path: 'api-evidence/out-of-stock.response.json',
          bytes: 54,
          sha256:
            '15c09fd1211303d69dfda7a3c840e63ea349bb2e09d7b2196ff84305e3f4b8d2',
        },
        {
          path: 'api-evidence/out-of-stock.headers.txt',
          bytes: 194,
          sha256:
            'bd8024a402ca5c6cde7617f0f0121994d551bb40b57bc706209e8a9c0b7860ac',
        },
      ],
    },
    {
      id: 'stock-no-order',
      title: 'Confirm unavailable stock creates no order',
      method: 'GET',
      path: '/api/order',
      url: 'http://127.0.0.1:4175/api/order?runId=curl-evidence-8b3f76b1-errors',
      phase: 'exercise',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request GET 'http://127.0.0.1:4175/api/order?runId=curl-evidence-8b3f76b1-errors'",
      requestBody: null,
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 1.048,
      capturedAt: '2026-10-24T10:03:19.509100+00:00',
      responseBody: {
        order: null,
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'No order exists',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/stock-no-order.request.txt',
          bytes: 155,
          sha256:
            '4cae05eeea1b4fbfd3517a7899a200ce03503d0a0b39e670fafced6d7555cc18',
        },
        {
          path: 'api-evidence/stock-no-order.response.json',
          bytes: 14,
          sha256:
            'c8102108d1bb134ebcad39091412d5aeeb89cf96abb748c57253b33bcf89126b',
        },
        {
          path: 'api-evidence/stock-no-order.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
    {
      id: 'cleanup-checkout',
      title: 'Clean up checkout run',
      method: 'DELETE',
      path: '/api/run',
      url: 'http://127.0.0.1:4175/api/run?runId=curl-evidence-8b3f76b1-checkout',
      phase: 'cleanup',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request DELETE 'http://127.0.0.1:4175/api/run?runId=curl-evidence-8b3f76b1-checkout'",
      requestBody: null,
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 1.287,
      capturedAt: '2026-10-24T10:03:19.517793+00:00',
      responseBody: {
        runId: 'curl-evidence-8b3f76b1-checkout',
        cleaned: true,
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'Run cleanup acknowledged',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/cleanup-checkout.request.txt',
          bytes: 158,
          sha256:
            '41b1e61eeb3cf4399752dbc6d27f1c2baf2f7325f9a826b763db4750737cf520',
        },
        {
          path: 'api-evidence/cleanup-checkout.response.json',
          bytes: 58,
          sha256:
            '8019af8fa9daf752445207311b14ee9fd027988ada87faccfde72c67bf34d30e',
        },
        {
          path: 'api-evidence/cleanup-checkout.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
    {
      id: 'cleanup-errors',
      title: 'Clean up negative scenarios',
      method: 'DELETE',
      path: '/api/run',
      url: 'http://127.0.0.1:4175/api/run?runId=curl-evidence-8b3f76b1-errors',
      phase: 'cleanup',
      command:
        "curl --disable --silent --show-error --max-time 10 --noproxy 127.0.0.1 --request DELETE 'http://127.0.0.1:4175/api/run?runId=curl-evidence-8b3f76b1-errors'",
      requestBody: null,
      httpStatus: 200,
      expectedStatus: 200,
      curlExitCode: 0,
      elapsedMs: 0.82,
      capturedAt: '2026-10-24T10:03:19.526308+00:00',
      responseBody: {
        runId: 'curl-evidence-8b3f76b1-errors',
        cleaned: true,
      },
      responseHeaders:
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nDate: Sat, 24 Oct 2026 10:03:19 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nTransfer-Encoding: chunked\n\n',
      checks: [
        {
          label: 'Expected HTTP 200',
          passed: true,
        },
        {
          label: 'Run cleanup acknowledged',
          passed: true,
        },
      ],
      files: [
        {
          path: 'api-evidence/cleanup-errors.request.txt',
          bytes: 156,
          sha256:
            '72a553cd4d1d8d05af2d4b6a52e6e26702471820e3e0b443d71e5164b95ee9cb',
        },
        {
          path: 'api-evidence/cleanup-errors.response.json',
          bytes: 56,
          sha256:
            'c2929240f9cb682a8e2070ea3fbb307f61cbbb89b31adce8c6b282a74c04a696',
        },
        {
          path: 'api-evidence/cleanup-errors.headers.txt',
          bytes: 188,
          sha256:
            '9559dc983135f3d68e26508112ffa823494d9b21760785fdc59d93101aff4a51',
        },
      ],
    },
  ],
} as const;
