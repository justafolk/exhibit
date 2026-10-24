import type { RunList, Setup, Session, WorkspaceClient } from '../client';
import { Icon } from '../ui';
import { Runs } from './Runs';
import { FeaturedEvidence } from '../components/SampleEvidence';

export function Overview({
  data,
  client,
}: {
  data: RunList;
  setup: Setup;
  session: Session;
  client: WorkspaceClient;
}) {
  const attention = data.runs.filter((run) =>
    ['partial', 'failed', 'couldnt_run', 'unverified'].includes(run.status),
  ).length;
  return (
    <>
      <section className="review-hero">
        <div>
          <span className="eyebrow">EVIDENCE FOR AGENT-AUTHORED CHANGES</span>
          <h1>
            Less setup.
            <br />
            More proof.
          </h1>
          <p>
            Your agent brings the change and its evidence.
            <br />
            You review what worked, what failed, and what needs a closer look.
          </p>
          <div className="agent-actions">
            <a href="#/agents" className="primary">
              Give your agent the instructions <Icon name="arrow" size={16} />
            </a>
            {data.runs.some((run) => run.sample) && (
              <a
                href={`#/runs/${encodeURIComponent(data.runs.find((run) => run.sample)!.id)}`}
                className="secondary"
              >
                Open a report
              </a>
            )}
          </div>
        </div>
        <div className="review-summary">
          <span className="quiet-badge">
            {data.mode === 'demo' ? 'Preview workspace' : 'Workspace evidence'}
          </span>
          <h2>Your review queue</h2>
          <div>
            <strong>{data.runs.length}</strong>
            <span>recent runs</span>
          </div>
          <div>
            <strong>{attention}</strong>
            <span>need attention</span>
          </div>
          <p>
            Start with the result. Open the assertions and coverage gaps when
            you need detail.
          </p>
        </div>
      </section>
      {data.mode === 'demo' && <FeaturedEvidence />}
      <Runs data={data} client={client} embedded />
    </>
  );
}
