import { useState } from 'react';
import type { RunList, Session, WorkspaceClient } from '../client';
import { Icon, PageHeading } from '../ui';
import { Studio } from './Studio';
import { SampleGallery } from '../components/SampleEvidence';

export function Recordings({
  client,
  session,
  runs,
}: {
  client: WorkspaceClient;
  session: Session;
  runs: RunList;
}) {
  const [manualOpen, setManualOpen] = useState(
    new URLSearchParams(window.location.hash.split('?')[1]).get('manual') ===
      '1',
  );
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
      <SampleGallery />
      <section className="panel capture-empty">
        <div className="capture-empty-icon">
          <Icon name="branch" size={25} />
        </div>
        <div>
          <h2>Your workspace captures</h2>
          <p>
            The gallery above is a curated sample imported from GitHub Actions.
            Automatic ingestion of your workspace's artifacts is not connected
            yet.
          </p>
          <a className="text-link" href="#/agents">
            Get the agent instructions <Icon name="arrow" size={14} />
          </a>
        </div>
        <span className="quiet-badge">Sample gallery available</span>
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
