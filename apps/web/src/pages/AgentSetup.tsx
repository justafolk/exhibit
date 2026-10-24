import { useState } from 'react';
import { Icon, PageHeading } from '../ui';
import { downloadBlob } from '../studio/media';

export const agentInstructions = `# Exhibit: record evidence automatically

In a trusted, clean checkout of justafolk/exhibit:
1. Install dependencies with make bootstrap and install Chromium with npx playwright install chromium.
2. Implement the change and add deterministic Playwright assertions for its behavior.
3. Run checks and commit the change before capture. Do not weaken assertions to make a run pass.
4. Run npm run evidence:record. To focus the sample suite: npm run evidence:record -- --grep "sample reports".
5. Return the generated report.md, manifest.json, videos and traces from the printed bundle directory. Include failures and coverage gaps.

This command records Exhibit's own secret-free sample browser suite. It does not run customer staging flows, upload artifacts, post PR checks, or certify a verified verdict.
Never put customer credentials in this workflow. Hosted execution and ingestion are not connected yet.
`;
export function AgentSetup() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <PageHeading
        title="Give your agent the recording step"
        description="One handoff. The agent runs the checks and collects the footage."
      />
      <div className="agent-setup-layout">
        <section className="panel agent-instructions">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                AVAILABLE NOW · REPOSITORY SELF-TEST
              </span>
              <h2>Finish the change. Bring back evidence.</h2>
            </div>
            <Icon name="branch" size={23} />
          </div>
          <div className="agent-content">
            <p>
              Give these instructions to your coding agent in this repository.
              Video and traces are captured automatically while Playwright runs.
              No screen sharing, uploads, or chapter editing needed.
            </p>
            <div className="command-block">
              <span>Agent runs in a clean checkout</span>
              <code>npm run evidence:record</code>
            </div>
            <ol className="agent-steps">
              <li>
                <strong>Check the behavior</strong>
                <p>
                  Run deterministic browser assertions against Exhibit's sample
                  app.
                </p>
              </li>
              <li>
                <strong>Capture automatically</strong>
                <p>Keep videos and traces for passing and failing checks.</p>
              </li>
              <li>
                <strong>Return one bundle</strong>
                <p>
                  A commit-linked manifest, a readable report, and original
                  artifacts.
                </p>
              </li>
            </ol>
            <div className="agent-actions">
              <button
                className="primary"
                onClick={async () => {
                  setError('');
                  try {
                    await navigator.clipboard.writeText(agentInstructions);
                    setCopied(true);
                  } catch {
                    setError(
                      'Clipboard unavailable. Download the instructions instead.',
                    );
                  }
                }}
              >
                <Icon name="file" size={16} />
                {copied ? 'Instructions copied' : 'Copy agent instructions'}
              </button>
              <button
                className="secondary"
                onClick={() =>
                  downloadBlob(
                    new Blob([agentInstructions], { type: 'text/markdown' }),
                    'exhibit-agent-instructions.md',
                  )
                }
              >
                Download instructions
              </button>
            </div>
            {copied && (
              <p role="status" className="save-success">
                Agent instructions copied. Paste them into your coding agent.
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </div>
        </section>
        <aside className="panel agent-boundary">
          <span className="quiet-badge">HOSTED RUNNER · NOT CONNECTED</span>
          <h2>The goal: every agent change comes with a replay.</h2>
          <p>
            The hosted app is currently a review workspace. The local command
            records this repository; it does not start a customer run from this
            page.
          </p>
          <dl>
            <div>
              <dt>Available</dt>
              <dd>Local automatic capture, hashes, reports, and traces.</dd>
            </div>
            <div>
              <dt>Next</dt>
              <dd>
                Agent authentication, isolated execution, private uploads, and
                one PR report.
              </dd>
            </div>
          </dl>
          <a className="text-link" href="#/studio">
            See the recording workflow <Icon name="arrow" size={14} />
          </a>
        </aside>
      </div>
      <details className="panel advanced-tools">
        <summary>Advanced workspace configuration</summary>
        <p>
          Optional controls for operators preparing a future staging
          integration. They are not prerequisites for exploring reviews or
          running the local self-test.
        </p>
        <div className="advanced-links">
          <a href="#/setup">
            <Icon name="setup" />
            Repository & staging<span>Save environment references once</span>
          </a>
          <a href="#/flows">
            <Icon name="flow" />
            Flow definitions<span>Inspect or edit reusable checks</span>
          </a>
          <a href="#/prepare">
            <Icon name="file" />
            Contract inspector<span>Evaluate preparation metadata</span>
          </a>
        </div>
      </details>
    </>
  );
}
