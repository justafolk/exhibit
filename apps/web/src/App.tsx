import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  emptySetup,
  previewClient,
  type Run,
  type RunList,
  type Session,
  type Setup,
  type WorkspaceClient,
} from './client';
import {
  Badge,
  duration,
  Empty,
  Icon,
  Notice,
  PageHeading,
  statusLabels,
  type IconName,
} from './ui';

type Page = 'overview' | 'runs' | 'setup' | 'flows' | 'settings';
const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'runs', label: 'Evidence runs', icon: 'runs' },
  { id: 'setup', label: 'Workspace setup', icon: 'setup' },
  { id: 'flows', label: 'Flow catalog', icon: 'flow' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const readRoute = () => window.location.hash.replace(/^#\/?/, '') || 'overview';
const go = (route: string) => {
  window.location.hash = `/${route}`;
};
const message = (reason: unknown) =>
  reason instanceof Error
    ? reason.message
    : 'Something went wrong. Please try again.';

function Brand() {
  return (
    <a href="#/overview" className="brand" aria-label="Exhibit home">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span>exhibit</span>
    </a>
  );
}

function SignIn({
  client,
  onSession,
}: {
  client: WorkspaceClient;
  onSession: (session: Session) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<'login' | 'demo' | null>(null);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending('login');
    setError('');
    try {
      onSession(await client.login(email, password));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="auth-page">
      <header>
        <Brand />
        <span className="auth-note">Evidence for every change.</span>
      </header>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-symbol">
            <Icon name="shield" size={26} />
          </div>
          <h1>Welcome to Exhibit</h1>
          <p className="auth-description">
            Sign in to your workspace to review evidence,
            <br className="desktop-only" /> prepare flows, and ship with
            context.
          </p>
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={pending !== null}>
              {pending === 'login' ? 'Signing in…' : 'Sign in'}
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <div className="auth-divider">
            <span>Just taking a look?</span>
          </div>
          <button
            className="secondary auth-submit"
            disabled={pending !== null}
            onClick={async () => {
              setPending('demo');
              setError('');
              try {
                onSession(await client.demo());
              } catch (reason) {
                setError(message(reason));
              } finally {
                setPending(null);
              }
            }}
          >
            {pending === 'demo'
              ? 'Opening sample…'
              : 'Explore sample workspace'}
            <Icon name="arrow" size={17} />
          </button>
          <p className="auth-help">
            Sample data only. No repositories are connected and no pull requests
            are executed.
          </p>
        </div>
        <p className="auth-provision">
          Need an account? Ask your workspace administrator to provision access.
        </p>
      </main>
      <footer>Commit-linked evidence. Human judgment.</footer>
    </div>
  );
}

function RunTable({
  runs,
  compact = false,
}: {
  runs: Run[];
  compact?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pull request</th>
            <th>Outcome</th>
            {!compact && <th>Coverage</th>}
            <th>Duration</th>
            <th>
              <span className="sr-only">Open report</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <a
                  className="run-title"
                  href={`#/runs/${encodeURIComponent(run.id)}`}
                >
                  {run.title}
                </a>
                <div className="run-meta">
                  <Icon name="branch" size={13} />
                  <span>{run.repository}</span>
                  <span>#{run.pullRequest}</span>
                  {run.sample && <span className="sample-tag">Sample</span>}
                </div>
              </td>
              <td>
                <Badge status={run.status} />
              </td>
              {!compact && (
                <td className="coverage">
                  {run.flows.length} {run.flows.length === 1 ? 'flow' : 'flows'}
                  <small>
                    <code>{run.headSha.slice(0, 7)}</code>
                  </small>
                </td>
              )}
              <td className="duration">{duration(run.durationSeconds)}</td>
              <td>
                <a
                  className="icon-button"
                  href={`#/runs/${encodeURIComponent(run.id)}`}
                  aria-label={`Open report for PR ${run.pullRequest}`}
                >
                  <Icon name="arrow" size={16} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({
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

function Runs({
  data,
  refresh,
  busy,
}: {
  data: RunList;
  refresh: () => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState(
    new URLSearchParams(window.location.hash.split('?')[1]).get('q') || '',
  );
  const [filter, setFilter] = useState('all');
  const visible = data.runs.filter(
    (run) =>
      (filter === 'all' || run.status === filter) &&
      `${run.title} ${run.repository} ${run.pullRequest} ${run.id} ${run.headSha}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="Evidence runs"
        description="Review observed behavior against the exact pull request commit."
        action={
          <button className="secondary" onClick={refresh} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh runs'}
          </button>
        }
      />
      <section className="panel">
        <div className="runs-toolbar">
          <div className="filter-tabs" aria-label="Filter runs">
            {[
              ['all', 'All runs'],
              ['verified', 'Verified'],
              ['partial', 'Partial'],
              ['failed', 'Failed'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? 'selected' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Icon name="search" size={16} />
            <input
              aria-label="Search runs"
              placeholder="Search title, repository, or SHA…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        {visible.length ? (
          <RunTable runs={visible} />
        ) : (
          <Empty
            title={
              data.runs.length
                ? 'No matching runs'
                : 'Your evidence starts here'
            }
            action={
              data.runs.length ? (
                <button
                  className="secondary"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <a href="#/setup" className="secondary">
                  Set up your workspace
                </a>
              )
            }
          >
            {data.runs.length
              ? 'Try another search or change the outcome filter.'
              : 'No runs are stored yet. Repository setup is the next step.'}
          </Empty>
        )}
        <div className="panel-foot split">
          <span>
            Showing {visible.length} of {data.runs.length} runs · latest 100
          </span>
          <span>Staging evidence</span>
        </div>
      </section>
      <Notice>
        A complete contract is a starting point. Only a trusted execution with
        deterministic assertions can produce verified evidence.
      </Notice>
    </>
  );
}

function RunDetail({ client, id }: { client: WorkspaceClient; id: string }) {
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRun(undefined);
    setError('');
    client
      .getRun(id)
      .then((value) => {
        if (active) setRun(value);
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      });
    return () => {
      active = false;
    };
  }, [client, id, retry]);
  if (error)
    return (
      <div role="alert">
        <Empty
          title="Report unavailable"
          action={
            <button
              className="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          }
        >
          {error}
        </Empty>
      </div>
    );
  if (!run)
    return (
      <div role="status" className="loading-state">
        Loading evidence report…
      </div>
    );
  return (
    <>
      <a href="#/runs" className="back-link">
        ← All evidence runs
      </a>
      <PageHeading
        title={run.title}
        description={`${run.repository} · Pull request #${run.pullRequest}`}
        action={<Badge status={run.status} />}
      />
      {run.sample && (
        <Notice>
          <strong>Sample report.</strong> Illustrative assertions; no real
          execution or recording.
        </Notice>
      )}
      <section className="panel report-provenance">
        <div className="panel-heading">
          <h2>Run provenance</h2>
          <span className="quiet-badge">
            {run.sample ? 'Sample evidence' : 'Stored evidence'}
          </span>
        </div>
        <dl className="provenance-grid">
          <div>
            <dt>Run ID</dt>
            <dd>
              <code>{run.id}</code>
            </dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{run.environment}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{duration(run.durationSeconds)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{new Date(run.createdAt).toLocaleString()}</dd>
          </div>
          <div className="full">
            <dt>Head commit</dt>
            <dd>
              <code>{run.headSha}</code>
            </dd>
          </div>
        </dl>
      </section>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Assertions</h2>
            <span className="quiet-badge">
              {run.assertions.filter((item) => item.passed).length} /{' '}
              {run.assertions.length} passed
            </span>
          </div>
          {run.assertions.length ? (
            <ul className="assertion-list">
              {run.assertions.map((assertion, index) => (
                <li key={`${index}-${assertion.label}`}>
                  <span
                    className={`assertion-symbol ${assertion.passed ? 'pass' : 'fail'}`}
                  >
                    {assertion.passed ? (
                      <Icon name="check" size={14} />
                    ) : (
                      <Icon name="close" size={14} />
                    )}
                  </span>
                  <span>{assertion.label}</span>
                  <span className="quiet-text">
                    {assertion.passed ? 'Passed' : 'Failed'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No assertions recorded">
              This report contains no assertion results.
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Coverage gaps</h2>
            <span className="quiet-badge">{run.notCovered.length}</span>
          </div>
          {run.notCovered.length ? (
            <ul className="gap-list">
              {run.notCovered.map((item, index) => (
                <li key={`${index}-${item}`}>
                  <span className="gap-dot" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-copy">
              No coverage gaps were recorded. This does not establish complete
              coverage.
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Tested flows</h2>
        </div>
        <div className="flow-chips">
          {run.flows.length ? (
            run.flows.map((flow) => (
              <span key={flow}>
                <Icon name="flow" size={15} />
                <code>{flow}</code>
              </span>
            ))
          ) : (
            <span>No flows recorded</span>
          )}
        </div>
      </section>
      <Notice>
        Recordings and traces are not attached to this report. Artifact
        collection must be connected before downloads are available.
      </Notice>
    </>
  );
}

function SetupPage({
  initial,
  session,
  client,
  onSave,
}: {
  initial: Setup;
  session: Session;
  client: WorkspaceClient;
  onSave: (value: Setup) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const canEdit = session.workspace.role === 'owner';
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const fields: {
    key: keyof Setup;
    title: string;
    placeholder: string;
    help: string;
    type?: string;
  }[] = [
    {
      key: 'repository',
      title: 'Repository',
      placeholder: 'your-team/your-repository',
      help: 'Repository metadata only. A GitHub App installation is a separate step.',
    },
    {
      key: 'stagingUrl',
      title: 'Staging URL',
      placeholder: 'https://staging.example.com',
      help: 'The isolated environment for your approved flow. Never production.',
      type: 'url',
    },
    {
      key: 'testTenant',
      title: 'Test tenant reference',
      placeholder: 'exhibit-staging-tenant',
      help: 'A dedicated tenant reference. Do not paste credentials or access tokens.',
    },
    {
      key: 'runbookRef',
      title: 'Versioned runbook reference',
      placeholder:
        'agents/runbooks/checkout.yaml@0123456789abcdef0123456789abcdef01234567',
      help: 'Use an immutable reference reviewed by your team. Saving is not approval.',
    },
  ];
  return (
    <>
      <PageHeading
        title="Workspace setup"
        description="Define where evidence belongs before connecting execution."
      />
      <div className="form-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Repository & staging</h2>
              <p>Start with one repository and one dedicated test tenant.</p>
            </div>
            <span className="quiet-badge">
              {canEdit ? 'Owner access' : 'Read only'}
            </span>
          </div>
          <form
            className="setup-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError('');
              setSaved(false);
              try {
                const result = await client.saveSetup(draft);
                setDraft(result);
                onSave(result);
                setSaved(true);
              } catch (reason) {
                setError(message(reason));
              } finally {
                setPending(false);
              }
            }}
          >
            <fieldset disabled={!canEdit || pending}>
              {fields.map((field) => (
                <div className="form-field" key={field.key}>
                  <label htmlFor={field.key}>{field.title}</label>
                  <input
                    id={field.key}
                    type={field.type || 'text'}
                    value={draft[field.key]}
                    placeholder={field.placeholder}
                    maxLength={field.key === 'runbookRef' ? 1000 : 300}
                    aria-describedby={`${field.key}-help`}
                    onChange={(event) => {
                      setDraft({ ...draft, [field.key]: event.target.value });
                      setSaved(false);
                    }}
                  />
                  <p id={`${field.key}-help`} className="field-help">
                    {field.help}
                  </p>
                </div>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {saved && (
              <p role="status" className="save-success">
                <Icon name="check" size={16} />
                {session.mode === 'demo'
                  ? 'Sample workspace details saved for this session.'
                  : 'Workspace details saved.'}
              </p>
            )}
            <div className="form-actions">
              <span>
                {canEdit
                  ? dirty
                    ? 'You have unsaved changes.'
                    : 'No unsaved changes.'
                  : 'Only workspace owners can change setup.'}
              </span>
              <button
                className="primary"
                disabled={!canEdit || pending || !dirty}
              >
                {pending ? 'Saving…' : 'Save workspace details'}
              </button>
            </div>
          </form>
        </section>
        <aside className="form-aside">
          <div className="aside-symbol">
            <Icon name="shield" size={22} />
          </div>
          <h2>Configuration is the first step.</h2>
          <p>
            These details help prepare evidence requests. They do not grant
            access to your repository or staging environment.
          </p>
          <div className="integration-state">
            <span className="status-point amber" />
            <strong>Execution not connected</strong>
          </div>
          <p>
            A reviewed runbook, trusted GitHub installation, and isolated runner
            are required before customer code can run.
          </p>
          <a className="text-link" href="#/flows">
            Explore flow requirements
            <Icon name="arrow" size={15} />
          </a>
        </aside>
      </div>
    </>
  );
}

function Flows() {
  return (
    <>
      <PageHeading
        title="Flow catalog"
        description="Small, reviewable flows with deterministic expectations."
      />
      <Notice>
        <strong>Example catalog.</strong> This flow demonstrates the required
        structure. It is not approved for execution.
      </Notice>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">EXAMPLE FLOW</div>
            <h2>Checkout with a saved address</h2>
            <p>
              <code>checkout.saved-address</code>
            </p>
          </div>
          <span className="quiet-badge">Example only</span>
        </div>
        <div className="flow-definition">
          <div>
            <span className="definition-number">01</span>
            <div>
              <h3>Preconditions</h3>
              <p>
                Dedicated staging tenant, saved address, and a run-scoped cart.
              </p>
            </div>
          </div>
          <div>
            <span className="definition-number">02</span>
            <div>
              <h3>Deterministic assertions</h3>
              <p>
                Saved address is selected, the order total matches, and
                confirmation appears.
              </p>
            </div>
          </div>
          <div>
            <span className="definition-number">03</span>
            <div>
              <h3>Cleanup boundary</h3>
              <p>
                Remove only data tagged with the current run ID in the approved
                test tenant.
              </p>
            </div>
          </div>
          <div>
            <span className="definition-number">04</span>
            <div>
              <h3>Versioned knowledge</h3>
              <p>
                <code>agents/flows/checkout.yaml</code>
              </p>
            </div>
          </div>
        </div>
        <div className="panel-foot">
          <Icon name="info" size={15} />A flow definition describes the checks.
          A trusted run provides the evidence.
        </div>
      </section>
    </>
  );
}

function Settings({
  session,
  onLogout,
  pending,
}: {
  session: Session;
  onLogout: () => void;
  pending: boolean;
}) {
  return (
    <>
      <PageHeading
        title="Workspace settings"
        description="Your workspace identity, permissions, and current session."
      />
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>Workspace</h2>
          <span className="quiet-badge">
            {session.mode === 'demo' ? 'Sample workspace' : 'Private workspace'}
          </span>
        </div>
        <dl className="settings-list">
          <div>
            <dt>Workspace name</dt>
            <dd>{session.workspace.name}</dd>
          </div>
          <div>
            <dt>Workspace ID</dt>
            <dd>
              <code>{session.workspace.id}</code>
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>
              {session.user.name}
              <small>{session.user.email}</small>
            </dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>
              <span className="role-badge capitalize">
                {session.workspace.role}
              </span>
              <small>
                {session.workspace.role === 'owner'
                  ? 'Manage configuration and review evidence.'
                  : session.workspace.role === 'editor'
                    ? 'Prepare flows and review evidence.'
                    : 'Read workspace configuration and evidence.'}
              </small>
            </dd>
          </div>
        </dl>
        <div className="panel-foot split">
          <span>Permissions are assigned by your workspace administrator.</span>
          <a className="text-link" href="#/setup">
            Edit setup
            <Icon name="arrow" size={15} />
          </a>
        </div>
      </section>
      <section className="panel settings-panel session-panel">
        <div>
          <h2>Current session</h2>
          <p>
            {session.mode === 'demo'
              ? 'This session contains sample data and has no access to real repositories.'
              : 'Sign out to end your access on this browser.'}
          </p>
        </div>
        <button className="secondary" disabled={pending} onClick={onLogout}>
          <Icon name="logout" size={16} />
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </>
  );
}

export function App({ client = previewClient }: { client?: WorkspaceClient }) {
  const [session, setSession] = useState<Session | null>();
  const [authError, setAuthError] = useState('');
  const [route, setRoute] = useState(readRoute);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [data, setData] = useState<RunList>();
  const [setup, setSetup] = useState<Setup>(emptySetup);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [logoutPending, setLogoutPending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  useEffect(() => {
    let active = true;
    client
      .session()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((reason) => {
        if (active) {
          setAuthError(message(reason));
          setSession(null);
        }
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setMobileOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!session) {
      setData(undefined);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([client.listRuns(), client.getSetup()])
      .then(([runs, config]) => {
        if (active) {
          setData(runs);
          setSetup(config);
        }
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, session, revision]);
  const page = (route.split('/')[0].split('?')[0] || 'overview') as Page;
  const selectedPage = navigation.find((item) => item.id === page);
  const runId =
    page === 'runs' && route.includes('/')
      ? decodeURIComponent(route.split('/')[1].split('?')[0])
      : null;
  const onSession = (value: Session) => {
    setSession(value);
    setAuthError('');
    if (route === 'sign-in') go('overview');
  };
  async function logout() {
    setLogoutPending(true);
    try {
      await client.logout();
      setSession(null);
      setData(undefined);
      setSetup(emptySetup);
      go('sign-in');
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLogoutPending(false);
    }
  }
  if (session === undefined)
    return (
      <div className="boot-state" role="status">
        <Brand />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!session)
    return (
      <>
        {authError && (
          <div className="auth-error" role="alert">
            {authError}
            <button
              className="text-link"
              onClick={() => {
                setAuthError('');
                setSession(undefined);
                setRevision((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}
        <SignIn client={client} onSession={onSession} />
      </>
    );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileOpen ? 'is-open' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <a className="workspace-switch" href="#/settings">
          <span className="workspace-avatar">
            {session.workspace.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <strong>{session.workspace.name}</strong>
            <small>
              {session.mode === 'demo'
                ? 'Sample workspace'
                : 'Private workspace'}
            </small>
          </span>
          <span className="workspace-caret">⌄</span>
        </a>
        <div className="nav-group-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#/${item.id}`}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === 'runs' && data && (
                <span className="nav-count">{data.runs.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="boundary-note">
            <Icon name="shield" size={17} />
            <span>
              Staging only<small>Production stays untouched.</small>
            </span>
          </div>
          <a href="#/settings" className="account-link">
            <span className="account-avatar">
              {session.user.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </span>
            <span>
              <strong>{session.user.name}</strong>
              <small className="capitalize">{session.workspace.role}</small>
            </span>
            <Icon name="settings" size={16} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {selectedPage?.label || 'Overview'}
              {runId ? ' / Report' : ''}
            </strong>
          </div>
          <form
            className="global-search"
            onSubmit={(event) => {
              event.preventDefault();
              go(`runs?q=${encodeURIComponent(globalSearch)}`);
            }}
          >
            <Icon name="search" size={16} />
            <input
              ref={searchRef}
              aria-label="Quick search"
              placeholder="Quick search…"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </form>
          <span className="topbar-status">
            <span className="status-point" />
            {session.mode === 'demo' ? 'Sample mode' : 'Private workspace'}
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
          {session.mode === 'demo' && (
            <div className="sample-banner">
              <span className="sample-label">SAMPLE DATA</span>
              <span>
                You’re exploring illustrative evidence. No pull requests have
                been executed.
              </span>
              <a href="#/setup">
                Workspace setup
                <Icon name="arrow" size={14} />
              </a>
            </div>
          )}
          {error ? (
            <div role="alert" className="panel">
              <Empty
                title="Workspace is unavailable"
                action={
                  <button
                    className="secondary"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    Try again
                  </button>
                }
              >
                {error}
              </Empty>
            </div>
          ) : !data ? (
            <div className="loading-state" role="status">
              Loading workspace evidence…
            </div>
          ) : runId ? (
            <RunDetail client={client} id={runId} />
          ) : page === 'runs' ? (
            <Runs
              key={route}
              data={data}
              busy={loading}
              refresh={() => setRevision((value) => value + 1)}
            />
          ) : page === 'setup' ? (
            <SetupPage
              key={session.workspace.id}
              initial={setup}
              session={session}
              client={client}
              onSave={setSetup}
            />
          ) : page === 'flows' ? (
            <Flows />
          ) : page === 'settings' ? (
            <Settings
              session={session}
              onLogout={logout}
              pending={logoutPending}
            />
          ) : (
            <Overview data={data} setup={setup} session={session} />
          )}
          <footer className="page-footer">
            <span>Exhibit · evidence with context</span>
            <span>Built for human review.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
