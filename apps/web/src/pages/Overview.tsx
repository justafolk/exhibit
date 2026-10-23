import type { RunList, Setup, Session } from '../client';
import { Empty, Icon, PageHeading } from '../ui';
import { RunTable } from '../components/RunTable';

export function Overview({
  data,
  setup,
  session,
}: {
  data: RunList;
  setup: Setup;
  session: Session;
}) {
  const attention = data.runs.filter((run) =>
    ['partial', 'failed', 'couldnt_run'].includes(run.status),
  ).length;
  const steps = [
    {
      title: 'Establish your workspace',
      detail: `${session.workspace.name} · ${session.workspace.role} access`,
      done: true,
    },
    {
      title: 'Add your repository',
      detail: setup.repository || 'Choose the repository your team reviews.',
      done: !!setup.repository,
    },
    {
      title: 'Define the staging boundary',
      detail:
        setup.testTenant && setup.runbookRef
          ? 'Tenant and runbook references saved.'
          : 'Set a test tenant and versioned runbook.',
      done: !!setup.stagingUrl && !!setup.testTenant && !!setup.runbookRef,
    },
    {
      title: 'Connect execution',
      detail: 'Requires an approved isolated runner.',
      done: false,
    },
  ];
  return (
    <>
      <PageHeading
        title="Workspace overview"
        description="A clear view of your evidence, coverage, and next steps."
        action={
          <a className="secondary" href="#/setup">
            <Icon name="setup" size={16} />
            Workspace setup
          </a>
        }
      />
      <div className="metric-strip">
        <div>
          <span>Evidence runs</span>
          <strong>{data.runs.length}</strong>
          <small>
            Latest {data.mode === 'demo' ? 'sample' : 'stored'} runs
          </small>
        </div>
        <div>
          <span>Verified</span>
          <strong>
            {data.runs.filter((run) => run.status === 'verified').length}
            <i className="status-point green" />
          </strong>
          <small>Recorded assertions passed</small>
        </div>
        <div>
          <span>Needs attention</span>
          <strong>
            {attention}
            <i className="status-point amber" />
          </strong>
          <small>Failed, partial, or unable to run</small>
        </div>
        <div>
          <span>Execution</span>
          <strong className="metric-word">Not connected</strong>
          <small>Setup does not start a run</small>
        </div>
      </div>
      <div className="overview-grid">
        <section className="panel setup-panel">
          <div className="panel-heading">
            <div>
              <h2>Your next steps</h2>
              <p>Build a trustworthy path from commit to evidence.</p>
            </div>
            <span className="quiet-badge">
              {steps.filter((step) => step.done).length} of 4
            </span>
          </div>
          <ol className="setup-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className={`step-number ${step.done ? 'complete' : ''}`}>
                  {step.done ? <Icon name="check" size={14} /> : index + 1}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
                {index > 0 && index < 3 ? (
                  <a href="#/setup" className="text-link">
                    {step.done ? 'Review' : 'Set up'}
                    <Icon name="arrow" size={15} />
                  </a>
                ) : index === 3 ? (
                  <span className="quiet-text">Pending</span>
                ) : (
                  <span className="quiet-text">
                    {session.mode === 'demo' ? 'Sample' : 'Ready'}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section className="panel workspace-panel">
          <div className="panel-heading">
            <h2>Workspace details</h2>
            <a className="text-link" href="#/settings">
              Settings
              <Icon name="arrow" size={15} />
            </a>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Workspace</dt>
              <dd>{session.workspace.name}</dd>
            </div>
            <div>
              <dt>Your access</dt>
              <dd className="capitalize">{session.workspace.role}</dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>{setup.repository || 'Not configured'}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>Staging only</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent evidence</h2>
            <p>What ran, what passed, and what needs a closer look.</p>
          </div>
          <a className="text-link" href="#/runs">
            View all runs
            <Icon name="arrow" size={15} />
          </a>
        </div>
        {data.runs.length ? (
          <RunTable runs={data.runs.slice(0, 4)} compact />
        ) : (
          <Empty
            title="Your evidence starts here"
            action={
              <a className="secondary" href="#/setup">
                Set up your workspace
              </a>
            }
          >
            No runs are stored yet. Configure your repository and staging flow
            to prepare for execution.
          </Empty>
        )}
        <div className="panel-foot">
          <Icon name="shield" size={14} />
          <span>Every outcome belongs to an exact commit and environment.</span>
        </div>
      </section>
    </>
  );
}
