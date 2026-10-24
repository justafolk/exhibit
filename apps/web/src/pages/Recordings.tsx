import { useState } from 'react';
import type { RunList, Session, WorkspaceClient } from '../client';
import { Icon, PageHeading } from '../ui';
import { Studio } from './Studio';

export function Recordings({
  client,
  session,
  runs,
}: {
  client: WorkspaceClient;
  session: Session;
  runs: RunList;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  return (
    <>
      <PageHeading
        title="Agent recordings"
        description="Footage is an output of the agent's browser run, captured as it works."
        action={
          <a className="primary" href="#/agents">
            Set up your agent <Icon name="arrow" size={15} />
          </a>
        }
      />
      <section className="panel recording-explainer">
        <div className="recording-intro">
          <span className="eyebrow">AUTOMATIC CAPTURE</span>
          <h2>
            Your agent does the work.
            <br />
            Exhibit keeps the walkthrough.
          </h2>
          <p>
            Video, browser traces, assertion results, and the exact commit
            travel together. Review the result without recreating the agent's
            steps.
          </p>
        </div>
        <ol className="capture-pipeline">
          <li>
            <span>
              <Icon name="branch" />
            </span>
            <strong>Agent runs checks</strong>
            <p>
              In a trusted checkout, using deterministic browser assertions.
            </p>
          </li>
          <li>
            <span>
              <Icon name="video" />
            </span>
            <strong>Footage is captured</strong>
            <p>Playwright records automatically, including failed attempts.</p>
          </li>
          <li>
            <span>
              <Icon name="file" />
            </span>
            <strong>Evidence is bundled</strong>
            <p>
              Original recordings, traces, a report, and artifact checksums.
            </p>
          </li>
        </ol>
      </section>
      <section className="panel capture-empty">
        <div className="capture-empty-icon">
          <Icon name="video" size={29} />
        </div>
        <div>
          <h2>No hosted agent recordings yet</h2>
          <p>
            Local capture is available in this repository. Hosted upload and
            playback are not connected. Run the local capture command to create
            your first evidence bundle.
          </p>
          <a href="#/agents" className="text-link">
            Get the agent instructions <Icon name="arrow" size={14} />
          </a>
        </div>
        <span className="quiet-badge">Local capture available</span>
      </section>
      <details
        className="panel advanced-tools"
        open={manualOpen}
        onToggle={(event) => setManualOpen(event.currentTarget.open)}
      >
        <summary>Manual recording tools · optional</summary>
        <p>
          For supplemental walkthroughs only. Manual footage is unverified and
          does not represent an automatic agent run.
        </p>
        {manualOpen && (
          <div className="manual-tools">
            <Studio client={client} session={session} runs={runs} />
          </div>
        )}
      </details>
    </>
  );
}
