import { useEffect, useRef, useState } from 'react';
import type { components } from '../../../packages/contracts/src/api';

type Run = components['schemas']['Run'];
type RunList = components['schemas']['RunList'];
type Evaluation = components['schemas']['Evaluation'];
type IconName =
  | 'grid'
  | 'flow'
  | 'book'
  | 'arrow'
  | 'check'
  | 'search'
  | 'branch'
  | 'clock'
  | 'close'
  | 'plus'
  | 'code';
const paths: Record<IconName, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  flow: 'M12 3v5 M5 16v-4h14v4 M8 3h8v4H8z M2 16h6v5H2z M16 16h6v5h-6z',
  book: 'M4 3h14a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3z M4 17h16 M8 7h8 M8 11h6',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  check: 'M5 12l4 4L19 6',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  branch: 'M6 3v12a4 4 0 0 0 8 0V9 M3 3a3 3 0 1 0 6 0 M11 6a3 3 0 1 0 6 0',
  clock: 'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  close: 'M6 6l12 12 M6 18L18 6',
  plus: 'M12 5v14 M5 12h14',
  code: 'M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
};
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
const labels: Record<Run['status'], string> = {
  verified: 'Verified',
  partial: 'Partial',
  failed: 'Failed',
  couldnt_run: 'Couldn’t run',
  queued: 'Queued',
  running: 'Running',
};
function Badge({ status }: { status: Run['status'] }) {
  return (
    <span className={`badge ${status}`}>
      <span aria-hidden="true">
        {status === 'verified' ? '✓' : status === 'failed' ? '×' : '•'}
      </span>
      {labels[status]}
    </span>
  );
}
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok)
    throw new Error(
      `The API returned ${response.status}. Check that the service and database are ready.`,
    );
  return response.json() as Promise<T>;
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="modal-title">
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function RunDetail({ run, onClose }: { run: Run; onClose: () => void }) {
  return (
    <Modal title="Evidence report" onClose={onClose}>
      {run.sample && (
        <div className="notice">
          Sample report · illustrative assertions, no real execution or
          recording.
        </div>
      )}
      <div className="report-title">
        <Badge status={run.status} />
        <h3>{run.title}</h3>
        <p>
          {run.repository} · PR #{run.pullRequest}
        </p>
      </div>
      <dl className="provenance">
        <div>
          <dt>Run ID</dt>
          <dd>{run.id}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{run.environment}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{duration(run.durationSeconds)}</dd>
        </div>
        <div className="full">
          <dt>Head SHA</dt>
          <dd>
            <code>{run.headSha}</code>
          </dd>
        </div>
      </dl>
      <h4>Assertions</h4>
      <ul className="assertions">
        {run.assertions.map((assertion) => (
          <li key={assertion.label}>
            <span className={assertion.passed ? 'pass' : 'fail'}>
              {assertion.passed ? '✓' : '×'}
            </span>
            {assertion.label}
          </li>
        ))}
      </ul>
      <h4>Not covered</h4>
      <ul className="not-covered">
        {run.notCovered.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="report-foot">
        {run.sample
          ? 'Videos and traces will appear here when a trusted runner produces real artifacts.'
          : 'Artifact delivery is not connected in this foundation.'}
      </div>
    </Modal>
  );
}
function ContractCheck({ onClose }: { onClose: () => void }) {
  const [repository, setRepository] = useState('acme/storefront');
  const [tenant, setTenant] = useState('exhibit-test');
  const [kind, setKind] = useState('frontend');
  const [result, setResult] = useState<Evaluation>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Check an evidence contract" onClose={onClose}>
      <p className="muted">
        Try the completeness gate with sample metadata. This never starts a run
        or connects to staging.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError('');
          setResult(undefined);
          try {
            setResult(
              await request<Evaluation>('/api/v1/contracts/evaluate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  repository,
                  pullRequest: 286,
                  headSha: '0000000000000000000000000000000000000412',
                  changeKind: kind,
                  environment: 'staging',
                  flowIds: ['checkout.saved-address'],
                  runbookRef: 'agents/runbooks/example.yaml',
                  testTenant: tenant,
                }),
              }),
            );
          } catch (reason) {
            setError((reason as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Repository
          <input
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="owner/repository"
          />
        </label>
        <label>
          Change type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="frontend">Frontend</option>
            <option value="backend">Backend</option>
            <option value="fullstack">Full stack</option>
            <option value="docs">Documentation</option>
            <option value="migration">Database migration</option>
          </select>
        </label>
        <label>
          Test tenant
          <input
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            placeholder="Dedicated staging tenant"
          />
        </label>
        <p className="field-help">
          Sample PR #286 · staging · checkout.saved-address
          <br />
          SHA 000000…0412 · versioned example runbook
        </p>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Evaluate contract'}
          <Icon name="arrow" />
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className={`evaluation ${result.state}`}>
          <strong>
            {result.state === 'ready'
              ? 'Ready for policy review'
              : result.state === 'needs_info'
                ? 'Needs information'
                : 'Not testable'}
          </strong>
          <p>{result.reason}</p>
          {result.missing.length > 0 && (
            <p>Missing: {result.missing.join(', ')}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
function ReferencePage({ page }: { page: 'flows' | 'runbook' }) {
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">THE KNOWLEDGE LAYER</div>
        <h1>
          {page === 'flows'
            ? 'Small catalog. Meaningful proof.'
            : 'A repeatable way to run.'}
        </h1>
        <p className="muted">
          Versioned, reviewable knowledge lives alongside the code.
        </p>
      </div>
      <div className="reference-card">
        <span className="eyebrow">
          {page === 'flows' ? 'EXAMPLE FLOW' : 'LOCAL DEVELOPMENT'}
        </span>
        <h2>
          {page === 'flows'
            ? 'Checkout with a saved address'
            : 'From a fresh clone to a running app'}
        </h2>
        {page === 'flows' ? (
          <>
            <p>
              One focused flow is enough to begin. Define its preconditions,
              deterministic assertions, and cleanup before connecting a runner.
            </p>
            <dl className="reference-list">
              <div>
                <dt>Catalog</dt>
                <dd>
                  <code>agents/flows/checkout.yaml</code>
                </dd>
              </div>
              <div>
                <dt>Preconditions</dt>
                <dd>Dedicated test tenant, saved address, run-scoped cart</dd>
              </div>
              <div>
                <dt>Assertions</dt>
                <dd>
                  Address selected, order total matches, confirmation appears
                </dd>
              </div>
              <div>
                <dt>Cleanup</dt>
                <dd>Remove only records tagged with the run ID</dd>
              </div>
            </dl>
            <div className="notice">
              Example only. A customer runbook and seed script must be reviewed
              before execution.
            </div>
          </>
        ) : (
          <>
            <p>
              Start with sample evidence, then switch to your checkout’s
              isolated PostgreSQL database.
            </p>
            <ol className="runbook">
              <li>
                <strong>Prepare the checkout</strong>
                <code>make bootstrap</code>
              </li>
              <li>
                <strong>Start web and API</strong>
                <code>make dev</code>
              </li>
              <li>
                <strong>Verify your changes</strong>
                <code>make check && make e2e</code>
              </li>
              <li>
                <strong>Work in parallel</strong>
                <code>make worktree NAME=your-task</code>
              </li>
            </ol>
            <p className="muted">
              Full instructions: <code>docs/development.md</code>. MVP scope:{' '}
              <code>docs/product.md</code>.
            </p>
          </>
        )}
      </div>
    </>
  );
}
export function App() {
  const [page, setPage] = useState<'runs' | 'flows' | 'runbook'>('runs');
  const [data, setData] = useState<RunList>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Run>();
  const [contractOpen, setContractOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setData(undefined);
    request<RunList>('/api/v1/runs', { signal: controller.signal })
      .then(setData)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [refresh]);
  const runs = data?.runs ?? [];
  const visible = runs.filter(
    (run) =>
      (filter === 'all' || run.status === filter) &&
      `${run.title} ${run.repository} ${run.pullRequest} ${run.id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const verified = runs.filter((run) => run.status === 'verified').length;
  const attention = runs.filter((run) =>
    ['failed', 'partial', 'couldnt_run'].includes(run.status),
  ).length;
  const latest = runs[0];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Exhibit home">
          <span className="brand-mark">e</span>exhibit
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">E</span>
          <div>
            Exhibit workspace<small>Developer preview</small>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              ['runs', 'grid', 'Evidence'],
              ['flows', 'flow', 'Flow catalog'],
              ['runbook', 'book', 'Runbook'],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              className={page === key ? 'nav-item active' : 'nav-item'}
              onClick={() => setPage(key)}
              aria-current={page === key ? 'page' : undefined}
            >
              <Icon name={icon} />
              {label}
              {key === 'runs' && data && (
                <span className="nav-count">{runs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="little-spark">✧</span>
          <h3>Good changes deserve proof.</h3>
          <p>Give every reviewer a front-row seat to what works.</p>
          <button onClick={() => setPage('runbook')}>
            Read the runbook
            <Icon name="arrow" size={15} />
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">EX</span>
          <div>
            Exhibit<small>MVP foundation · v0.1</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace<span>/</span>
            <strong>
              {page === 'runs'
                ? 'Evidence'
                : page === 'flows'
                  ? 'Flow catalog'
                  : 'Runbook'}
            </strong>
          </div>
          <span className="preview-label">
            <span />
            {data?.mode === 'postgres' ? 'Local database' : 'Developer preview'}
          </span>
        </header>
        <main>
          {page !== 'runs' ? (
            <ReferencePage page={page} />
          ) : (
            <>
              <div className="page-heading heading-row">
                <div>
                  <div className="eyebrow">
                    LESS GUESSWORK. MORE CONFIDENCE.
                  </div>
                  <h1>The proof is in the pull request.</h1>
                  <p className="muted">
                    See what changed. See it working. Know what to ship.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => setContractOpen(true)}
                >
                  <Icon name="plus" size={17} />
                  Check a contract
                </button>
              </div>
              {(data?.mode === 'demo' || runs.some((run) => run.sample)) && (
                <div className="demo-notice">
                  <span className="demo-tag">SAMPLE DATA</span>
                  <span>
                    You’re exploring illustrative evidence. No PRs have been
                    executed.
                  </span>
                  <button onClick={() => setPage('runbook')}>
                    Set up your workspace
                    <Icon name="arrow" size={15} />
                  </button>
                </div>
              )}
              <div className="stats">
                <div className="stat">
                  <span>
                    Evidence runs
                    <Icon name="branch" />
                  </span>
                  <strong>
                    {data ? runs.length.toString().padStart(2, '0') : '—'}
                  </strong>
                  <small>
                    Latest {data?.mode === 'demo' ? 'sample' : 'stored'} runs
                  </small>
                </div>
                <div className="stat">
                  <span>
                    Verified
                    <Icon name="check" />
                  </span>
                  <strong>
                    {data ? verified.toString().padStart(2, '0') : '—'}
                    <span className="stat-dot green" />
                  </strong>
                  <small>All recorded assertions passed</small>
                </div>
                <div className="stat">
                  <span>
                    Needs a closer look
                    <Icon name="search" />
                  </span>
                  <strong>
                    {data ? attention.toString().padStart(2, '0') : '—'}
                    <span className="stat-dot amber" />
                  </strong>
                  <small>Partial, failed, or unable to run</small>
                </div>
              </div>
              <section className="runs-panel" aria-labelledby="runs-title">
                <div className="panel-heading">
                  <div>
                    <h2 id="runs-title">
                      Evidence runs
                      <span className="count-pill">{runs.length}</span>
                    </h2>
                    <p>A clear trail from code change to observed behavior.</p>
                  </div>
                  <button
                    className="subtle-button"
                    onClick={() => setRefresh((value) => value + 1)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="table-toolbar">
                  <div className="filters" aria-label="Filter runs">
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
                      placeholder="Search runs…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                {error ? (
                  <div role="alert" className="empty-state">
                    <h3>Evidence is unavailable</h3>
                    <p>{error}</p>
                    <button
                      className="subtle-button"
                      onClick={() => setRefresh((value) => value + 1)}
                    >
                      Try again
                    </button>
                  </div>
                ) : !data ? (
                  <div role="status" className="empty-state">
                    Loading evidence…
                  </div>
                ) : visible.length === 0 ? (
                  <div className="empty-state">
                    <h3>
                      {runs.length
                        ? 'No matching runs'
                        : 'Your evidence starts here'}
                    </h3>
                    <p>
                      {runs.length
                        ? 'Try another search or status filter.'
                        : 'No runs are stored yet. Connect a runner in the next milestone, or seed the local sample records.'}
                    </p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Pull request</th>
                          <th>Outcome</th>
                          <th>Coverage</th>
                          <th>Duration</th>
                          <th>
                            <span className="sr-only">Report</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((run) => (
                          <tr key={run.id}>
                            <td>
                              <button
                                className="run-title"
                                onClick={() => setSelected(run)}
                              >
                                {run.title}
                              </button>
                              <div className="run-meta">
                                <Icon name="branch" size={13} />
                                {run.repository}
                                <span>#{run.pullRequest}</span>
                                {run.sample && (
                                  <span className="sample-label">sample</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <Badge status={run.status} />
                            </td>
                            <td className="coverage">
                              {run.flows.length}{' '}
                              {run.flows.length === 1 ? 'flow' : 'flows'}
                              <small>
                                {run.headSha.slice(0, 7)}…
                                {run.headSha.slice(-4)}
                              </small>
                            </td>
                            <td className="run-duration">
                              {duration(run.durationSeconds)}
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Open report for PR ${run.pullRequest}`}
                                onClick={() => setSelected(run)}
                              >
                                <Icon name="arrow" size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {data
                      ? `Showing ${visible.length} of ${runs.length} runs`
                      : 'Connecting to the API'}
                  </span>
                  <span>
                    <span className="small-dot" />
                    Staging evidence · never production
                  </span>
                </div>
              </section>
              <div className="bottom-grid">
                <section className="proof-card">
                  <div className="proof-icon">
                    <Icon name="check" size={23} />
                  </div>
                  <div>
                    <div className="eyebrow">EVIDENCE, WITH CONTEXT</div>
                    <h2>A verdict is only the beginning.</h2>
                    <p>
                      Every report pairs assertions with the exact commit,
                      tested flows, and an honest account of what wasn’t
                      covered.
                    </p>
                    {latest && (
                      <button
                        className="text-link"
                        onClick={() => setSelected(latest)}
                      >
                        Explore a {latest.sample ? 'sample ' : ''}report
                        <Icon name="arrow" size={16} />
                      </button>
                    )}
                  </div>
                </section>
                <section className="how-card">
                  <h3>From change to confidence</h3>
                  <ol>
                    <li>
                      <span>01</span>Define the flow
                    </li>
                    <li>
                      <span>02</span>Run against staging
                    </li>
                    <li>
                      <span>03</span>Review the evidence
                    </li>
                  </ol>
                  <small>Execution arrives in the next milestone.</small>
                </section>
              </div>
              <footer className="page-footer">
                Built for human judgment.
                <span>exhibit · evidence over assumptions</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {selected && (
        <RunDetail run={selected} onClose={() => setSelected(undefined)} />
      )}
      {contractOpen && <ContractCheck onClose={() => setContractOpen(false)} />}
    </div>
  );
}
