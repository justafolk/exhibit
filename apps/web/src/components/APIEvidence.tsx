import { useState } from 'react';
import { apiEvidence } from '../sample/apiEvidence';
import { sampleAsset } from '../sample/fieldStore';

export function APIEvidence() {
  const [selected, setSelected] = useState<string>('create-order');
  const [copyState, setCopyState] = useState('Copy cURL');
  const call = apiEvidence.calls.find((c) => c.id === selected)!;
  async function copy() {
    try {
      await navigator.clipboard.writeText(call.command);
      setCopyState('Copied');
    } catch {
      setCopyState('Copy unavailable — download the command below');
    }
  }
  return (
    <section className="api-evidence" aria-label="API evidence">
      <div className="panel api-capture-summary">
        <span className="eyebrow">SUPPLEMENTAL LOCAL CAPTURE</span>
        <h2>Requests, responses, and the checks behind them.</h2>
        <p>
          11 actual cURL requests cover checkout, error responses, persistence,
          and cleanup. Expected 400, 402, and 409 responses passed their checks.
        </p>
        <p>
          These checkout requests were captured locally against the linked
          source commit. The source PR changed workflow configuration, not API
          code; this supplement is separate from the CI artifact.
        </p>
        <small>
          Captured {apiEvidence.startedAt} · source{' '}
          {apiEvidence.headSha.slice(0, 7)} · provenance unverified
        </small>
        <p>
          <a
            className="text-link"
            href={sampleAsset('api-evidence/manifest.json')}
            download
          >
            Download API capture manifest
          </a>
        </p>
      </div>
      <div className="api-capture-layout">
        <div className="panel api-request-list" aria-label="Captured requests">
          {apiEvidence.calls.map((c) => (
            <button
              key={c.id}
              aria-pressed={c.id === selected}
              onClick={() => {
                setSelected(c.id);
                setCopyState('Copy cURL');
              }}
            >
              <small>
                {c.phase} · HTTP {c.httpStatus}
              </small>
              <strong>{c.title}</strong>
              <code>
                {c.method} {c.path}
              </code>
            </button>
          ))}
        </div>
        <article className="panel api-request-detail" key={call.id}>
          <span className="result-pass">Expected response matched</span>
          <h2>{call.title}</h2>
          <p>
            <code>
              {call.method} {call.path}
            </code>{' '}
            · HTTP {call.httpStatus} · {call.elapsedMs.toFixed(2)} ms · cURL
            exit {call.curlExitCode}
          </p>
          <ul>
            {call.checks.map((c) => (
              <li key={c.label}>✓ {c.label}</li>
            ))}
          </ul>
          <h3>Request</h3>
          <p>
            These commands target the captured local fixture server. Start that
            source commit locally before replaying, and run the setup request
            first.
          </p>
          <pre tabIndex={0} aria-label="cURL command">
            <code>{call.command}</code>
          </pre>
          <button className="secondary" onClick={copy}>
            Copy cURL
          </button>
          <span role="status" className="api-copy-status">
            {copyState === 'Copy cURL' ? '' : copyState}
          </span>
          <h3>Response body</h3>
          <pre tabIndex={0} aria-label="Response body">
            <code>{JSON.stringify(call.responseBody, null, 2)}</code>
          </pre>
          <details>
            <summary>Response headers</summary>
            <pre tabIndex={0}>{call.responseHeaders}</pre>
          </details>
          <h3>Original capture files</h3>
          <ul className="api-file-list">
            {call.files.map((f) => (
              <li key={f.path}>
                <a href={sampleAsset(f.path)} download>
                  {f.path.split('/').pop()}
                </a>
                <small>{f.bytes} bytes · SHA-256</small>
                <code>{f.sha256}</code>
              </li>
            ))}
          </ul>
          <small>
            Captured {call.capturedAt}. Timing is from one local request, not a
            performance benchmark.
          </small>
        </article>
      </div>
    </section>
  );
}
