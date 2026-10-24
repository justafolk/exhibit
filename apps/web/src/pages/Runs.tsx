import { useEffect, useState } from 'react';
import type { Run, RunList, WorkspaceClient } from '../client';
import { Empty, Icon, Notice, PageHeading, statusLabels } from '../ui';
import { RunTable } from '../components/RunTable';
import { message } from '../navigation';

const statuses = Object.keys(statusLabels) as Run['status'][];
type Outcome = Run['status'] | 'attention' | '';
const needsAttention = (run: Run) =>
  ['partial', 'failed', 'couldnt_run', 'unverified'].includes(run.status);
function initialFilters(): { q: string; status: Outcome } {
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const status = params.get('status');
  return {
    q: params.get('q') || '',
    status:
      params.get('attention') === '1'
        ? 'attention'
        : statuses.includes(status as Run['status'])
          ? (status as Run['status'])
          : '',
  };
}
function filterQuery(q: string, status: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status === 'attention') params.set('attention', '1');
  else if (status) params.set('status', status);
  return params.size ? `?${params}` : '';
}

export function Runs({
  client,
  data,
  embedded = false,
}: {
  client: WorkspaceClient;
  data: RunList;
  embedded?: boolean;
}) {
  const initial = initialFilters();
  const [query, setQuery] = useState(initial.q);
  const [filter, setFilter] = useState(initial.status);
  const [result, setResult] = useState<RunList>(data);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reportQuery = filterQuery(query, filter);
  const visibleRuns =
    filter === 'attention' ? result.runs.filter(needsAttention) : result.runs;
  useEffect(() => {
    let active = true;
    setPending(true);
    setError('');
    const timer = window.setTimeout(
      () => {
        client
          .listRuns({
            q: query,
            status: filter === 'attention' ? undefined : filter || undefined,
          })
          .then((value) => {
            if (active) setResult(value);
          })
          .catch((reason) => {
            if (active) setError(message(reason));
          })
          .finally(() => {
            if (active) setPending(false);
          });
      },
      query ? 180 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, query, filter, revision]);
  function update(q: string, status: typeof filter, push = false) {
    const next = `#/runs${filterQuery(q, status)}`;
    if (push) window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
    setQuery(q);
    setFilter(status);
  }
  return (
    <>
      <PageHeading
        level={embedded ? 2 : 1}
        title="Review changes"
        description="Open a result. Check the assertions. Decide what to ship."
        action={
          <button
            className="secondary"
            disabled={pending}
            onClick={() => setRevision((value) => value + 1)}
          >
            {pending ? 'Refreshing…' : 'Refresh runs'}
          </button>
        }
      />
      <section className="panel">
        <div className="runs-toolbar">
          <div className="filter-tabs all-statuses" aria-label="Filter runs">
            <button
              aria-pressed={!filter}
              className={!filter ? 'selected' : ''}
              onClick={() => update(query, '', true)}
            >
              All runs
            </button>
            <button
              aria-pressed={filter === 'attention'}
              className={filter === 'attention' ? 'selected' : ''}
              onClick={() => update(query, 'attention', true)}
            >
              Needs attention
            </button>
            {statuses.map((status) => (
              <button
                key={status}
                aria-pressed={filter === status}
                className={filter === status ? 'selected' : ''}
                onClick={() => update(query, status, true)}
              >
                {statusLabels[status]}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Icon name="search" size={16} />
            <input
              aria-label="Search runs"
              placeholder="Title, repository, PR, or full SHA…"
              value={query}
              maxLength={200}
              onChange={(event) => update(event.target.value, filter)}
            />
          </label>
        </div>
        {error ? (
          <div role="alert">
            <Empty
              title="Evidence is unavailable"
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
        ) : pending ? (
          <div className="loading-state" role="status">
            Finding matching evidence…
          </div>
        ) : visibleRuns.length ? (
          <RunTable runs={visibleRuns} reportQuery={reportQuery} />
        ) : (
          <Empty
            title={
              query || filter ? 'No matching runs' : 'Your evidence starts here'
            }
            action={
              query || filter ? (
                <button
                  className="secondary"
                  onClick={() => update('', '', true)}
                >
                  Clear filters
                </button>
              ) : (
                <a href="#/agents" className="secondary">
                  Set up your agent
                </a>
              )
            }
          >
            {query || filter
              ? 'Try another search or change the outcome filter.'
              : 'No runs are stored yet. Give your agent the recording instructions to get started.'}
          </Empty>
        )}
        <div className="panel-foot split">
          <span>
            {pending
              ? 'Loading matching runs…'
              : `${visibleRuns.length} matching runs · latest 100 maximum`}
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
